//! In-app updates via tauri-plugin-updater.
//!
//! The installers are not Apple / Windows code-signed, so a freshly downloaded
//! .dmg / -setup.exe meets Gatekeeper / SmartScreen. Files written by the app
//! itself carry no quarantine attribute, so an update applied from here starts
//! without that warning; only the first install still shows it.
//!
//! The check runs a few seconds after launch and then once a day while the
//! app keeps running (release builds only), and from the tray menu. The tray
//! menu item also shows the download's progress, and an update put off with
//! "あとで" (its version, to install it from there).
//!
//! The dialog names the app in its title, and what changed is on the GitHub
//! release page ("更新内容を見る"), not in the dialog (Platform Distribution §4).
//!
//! The settings' "アップデート" section shows the same check's state
//! ([`UpdateState`], sent as `update-state`). While the snippets and settings
//! window is open, every result goes there instead of a dialog, so nothing
//! pops up in front of someone working in it (Platform Distribution §4).

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, SystemTime},
};

use serde::Serialize;
use tauri::{async_runtime::block_on, menu::MenuItem, AppHandle, Emitter, Manager, Url, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::{proxy, store::Store};

/// Same as `plugins.updater.endpoints` in tauri.conf.json. Other tools'
/// releases share this repository, so the feed lives on its own fixed release
/// instead of `releases/latest`.
const FEED: &str = "https://github.com/2204601/workbench/releases/download/clip-updater/latest.json";

/// The tag of a version's release (and its notes) in the same repository.
const RELEASE_PAGE: &str = "https://github.com/2204601/workbench/releases/tag/clip-v";

pub const MENU_LABEL: &str = "アップデートを確認…";

/// How often the app checks while it keeps running. Clip lives in the menu
/// bar and is rarely quit, so a check at launch alone could go stale for
/// days. An update put off with "あとで" is offered again on the next one.
const INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// Set while a check or a download is running.
static BUSY: AtomicBool = AtomicBool::new(false);

/// What the settings' "アップデート" section shows.
static STATE: Mutex<UpdateState> = Mutex::new(UpdateState::Idle);

/// The version the last check found, to install from the settings or the
/// tray menu without asking GitHub again.
static FOUND: Mutex<Option<Update>> = Mutex::new(None);

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum UpdateState {
    /// Not checked yet since launch.
    Idle,
    Checking,
    Latest,
    Available {
        version: String,
    },
    /// Downloading (`percent` once the size is known), then installing
    /// (`percent` is `None` again).
    Installing {
        percent: Option<u64>,
    },
    /// The check failed.
    Error {
        message: String,
    },
    /// Installing `version` failed; it can be tried again.
    Failed {
        version: String,
        message: String,
    },
}

/// Where a check was started; decides where its result is shown.
#[derive(Clone, Copy, PartialEq)]
pub enum Check {
    /// A few seconds after launch and once a day: silent unless there is one.
    Auto,
    /// The tray menu: always says how it went.
    Menu,
    /// The settings' "アップデート" section: says it there.
    Settings,
}

/// The tray menu item that starts a manual check.
pub struct MenuEntry(pub MenuItem<Wry>);

/// Checks a few seconds after launch and then every [`INTERVAL`], in release
/// builds.
pub fn check_periodically(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(4));
        let mut last = SystemTime::now();
        check_if_on(&app);
        loop {
            // Measured on the wall clock, checked hourly: `thread::sleep` can
            // stand still while the computer sleeps, so sleeping a whole day
            // at once could take several days of laptop use to run out.
            thread::sleep(Duration::from_secs(60 * 60));
            if last.elapsed().map_or(true, |e| e >= INTERVAL) {
                last = SystemTime::now();
                check_if_on(&app);
            }
        }
    });
}

/// The automatic check, unless it was turned off in the settings.
fn check_if_on(app: &AppHandle) {
    if app.state::<Store>().settings().auto_update {
        check(app, Check::Auto);
    }
}

/// Checks GitHub Releases for a newer version. A check from the menu also
/// reports "up to date" and errors; the automatic one stays silent unless an
/// update exists. With the settings open, the result goes to its section.
pub fn check(app: &AppHandle, from: Check) {
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    thread::spawn(move || {
        set_state(&app, UpdateState::Checking);
        if from != Check::Auto {
            set_menu(&app, "アップデートを確認しています…", false);
        }
        let in_settings = from == Check::Settings || settings_open(&app);
        // In the settings, a check from the menu brings its section forward.
        if in_settings && from == Check::Menu {
            reveal_section(&app);
        }
        let found = find(&app);
        let version = app.package_info().version.to_string();
        match found {
            Ok(Some(update)) => {
                set_state(&app, UpdateState::Available { version: update.version.clone() });
                *FOUND.lock().unwrap() = Some(update.clone());
                if !in_settings {
                    offer(&app, update);
                }
            }
            Ok(None) => {
                set_state(&app, UpdateState::Latest);
                *FOUND.lock().unwrap() = None;
                if from == Check::Menu && !in_settings {
                    show(&app, MessageDialogKind::Info, format!("Clip v{version} は最新版です。"));
                }
            }
            Err(e) => {
                eprintln!("update check failed: {e}");
                // The automatic check keeps a version found earlier on show.
                let last = FOUND.lock().unwrap().as_ref().map(|u| u.version.clone());
                set_state(
                    &app,
                    match last {
                        Some(version) if from == Check::Auto => UpdateState::Available { version },
                        _ => UpdateState::Error { message: e.to_string() },
                    },
                );
                if from == Check::Menu && !in_settings {
                    show(&app, MessageDialogKind::Error, format!("アップデートを確認できませんでした。\n{e}"));
                }
            }
        }
        sync_menu(&app);
        BUSY.store(false, Ordering::SeqCst);
    });
}

/// "更新して再起動" in the settings: installs the version the last check
/// found.
pub fn install_found(app: &AppHandle) {
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    thread::spawn(move || {
        let update = FOUND.lock().unwrap().clone();
        if let Some(update) = update {
            install(&app, update);
        }
        sync_menu(&app);
        BUSY.store(false, Ordering::SeqCst);
    });
}

/// The section's state, for the window when it loads.
pub fn state() -> UpdateState {
    STATE.lock().unwrap().clone()
}

fn set_state(app: &AppHandle, state: UpdateState) {
    *STATE.lock().unwrap() = state.clone();
    let _ = app.emit("update-state", state);
}

/// The menu item offers a version that was found and not installed.
fn sync_menu(app: &AppHandle) {
    match FOUND.lock().unwrap().as_ref() {
        Some(update) => set_menu(app, &format!("v{} に更新…", update.version), true),
        None => set_menu(app, MENU_LABEL, true),
    }
}

/// Whether the snippets and settings window is up, where the "アップデート"
/// section is.
fn settings_open(app: &AppHandle) -> bool {
    app.get_webview_window("manage")
        .is_some_and(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
}

/// Brings the window forward on its settings, at the "アップデート" section.
fn reveal_section(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("manage") {
        let _ = window.set_focus();
        bring_to_front(app);
        let _ = window.emit("show-update", ());
    }
}

fn find(app: &AppHandle) -> tauri_plugin_updater::Result<Option<Update>> {
    let mut builder = app.updater_builder().timeout(Duration::from_secs(15));
    // The updater's HTTP client can't evaluate PAC scripts, so behind a
    // company proxy it would try to connect directly and fail. The proxy also
    // applies to the download (the Update keeps it).
    if let Some(proxy) = proxy::for_url(FEED).and_then(|p| Url::parse(&p).ok()) {
        builder = builder.proxy(proxy);
    }
    block_on(builder.build()?.check())
}

const INSTALL: &str = "更新して再起動";
const LATER: &str = "あとで";
const NOTES: &str = "更新内容を見る";

/// Asks whether to install. The title names the app (on macOS the alert's
/// bold line, on Windows the window's title), so it never reads as an
/// anonymous pop-up. Put off, the version stays in the tray menu and the
/// settings until the next check.
fn offer(app: &AppHandle, update: Update) {
    let name = &app.package_info().name;
    let text = format!(
        "v{} が使えます（今のバージョンは v{}）。\n更新すると {name} が再起動します。",
        update.version, update.current_version
    );
    // Each OS's order: macOS puts the default on the right with "later" next
    // to it, Windows puts the default first and "later" last (Esc is "later").
    let buttons = if cfg!(target_os = "macos") {
        MessageDialogButtons::YesNoCancelCustom(INSTALL.into(), LATER.into(), NOTES.into())
    } else {
        MessageDialogButtons::YesNoCancelCustom(INSTALL.into(), NOTES.into(), LATER.into())
    };
    bring_to_front(app);
    let choice = app
        .dialog()
        .message(text)
        .title(format!("{name} の新しいバージョンがあります"))
        .kind(MessageDialogKind::Info)
        .buttons(buttons)
        .blocking_show_with_result();
    match choice {
        MessageDialogResult::Custom(c) if c == INSTALL => install(app, update),
        MessageDialogResult::Custom(c) if c == NOTES => open_release_page(&update.version),
        _ => {}
    }
}

/// Downloads and installs `update`, then restarts into it. Returns only when
/// it failed.
fn install(app: &AppHandle, update: Update) {
    let mut done = 0u64;
    let mut shown = None;
    set_state(app, UpdateState::Installing { percent: None });
    set_menu(app, "アップデートをダウンロードしています…", false);
    let result = block_on(update.download_and_install(
        |chunk, total| {
            done += chunk as u64;
            if let Some(total) = total.filter(|&t| t > 0) {
                let percent = (done * 100 / total).min(100);
                // Chunks arrive hundreds of times a second.
                if shown != Some(percent) {
                    shown = Some(percent);
                    set_state(app, UpdateState::Installing { percent: Some(percent) });
                    set_menu(app, &format!("アップデートをダウンロードしています… {percent}%"), false);
                }
            }
        },
        || {
            set_state(app, UpdateState::Installing { percent: None });
            set_menu(app, "アップデートをインストールしています…", false);
        },
    ));
    if let Err(e) = result {
        let text = format!("アップデートに失敗しました。もう一度試すか、GitHub から新しい版を入れてください。\n\n{e}");
        set_state(app, UpdateState::Failed { version: update.version.clone(), message: e.to_string() });
        if !settings_open(app) {
            show(app, MessageDialogKind::Error, text);
        }
        return;
    }
    // Windows: the installer has already been started and this process asked
    // to exit by now. macOS: the .app was swapped in place; restart into it.
    app.restart();
}

/// The version's release page (what changed) in the browser.
pub fn open_release_page(version: &str) {
    if let Err(e) = tauri_plugin_opener::open_url(format!("{RELEASE_PAGE}{version}"), None::<&str>) {
        eprintln!("release page: {e}");
    }
}

fn show(app: &AppHandle, kind: MessageDialogKind, text: String) {
    bring_to_front(app);
    let title = format!("{} のアップデート", app.package_info().name);
    app.dialog().message(text).title(title).kind(kind).buttons(MessageDialogButtons::Ok).blocking_show();
}

fn set_menu(app: &AppHandle, text: &str, enabled: bool) {
    if let Some(entry) = app.try_state::<MenuEntry>() {
        let _ = entry.0.set_text(text);
        let _ = entry.0.set_enabled(enabled);
    }
}

/// A menu-bar app isn't active on its own, so its dialogs would open behind
/// other apps' windows.
pub fn bring_to_front(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.run_on_main_thread(|| {
        use objc2_app_kit::NSApplication;
        use objc2_foundation::MainThreadMarker;
        if let Some(mtm) = MainThreadMarker::new() {
            #[allow(deprecated)] // `activate` needs macOS 14.
            NSApplication::sharedApplication(mtm).activateIgnoringOtherApps(true);
        }
    });
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}
