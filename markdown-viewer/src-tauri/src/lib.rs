pub mod commands;
pub mod doc;
pub mod feed;
pub mod proxy;
pub mod render;
pub mod settings;

use commands::*;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager, Runtime};

/// The log file's name in the app's log folder (without ".log").
pub const LOG_FILE: &str = "markdown-viewer";

/// Panics into the log too: release builds abort on panic, so stderr is all
/// that would be left, and nobody sees it.
fn log_panics() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("{info}");
        default(info);
    }));
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// The first file among a launch's arguments (Windows: a .md double-clicked
/// in Explorer, or "プログラムから開く"). The first argument is the app itself.
fn file_in_args(args: &[String], cwd: &Path) -> Option<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a))
        .find(|p| p.is_file())
        .map(|p| p.display().to_string())
}

/// A file the OS asks to open: kept for a page that hasn't loaded yet, and
/// sent to one that has (src/lib/actions.ts `listenForFiles`).
fn hand_over(app: &tauri::AppHandle, path: String) {
    log::info!("開くファイル: {path}");
    if let Ok(mut p) = app.state::<AppState>().pending.lock() {
        *p = Some(path.clone());
    }
    let _ = app.emit("open-file", path);
    show_main_window(app);
}

/// The app's state and commands, on any runtime (the tests use the mock one).
pub fn with_commands<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.manage(AppState::default()).invoke_handler(tauri::generate_handler![
        get_app_settings,
        set_app_settings,
        system_proxy,
        reveal_log,
        open_release_page,
        open_doc,
        close_doc,
        take_pending_file,
        read_image,
        follow_link,
        open_url,
        reveal_doc,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The menu bar is made by the frontend from its command table
    // (src/lib/menuBar.ts); until it loads, macOS shows Tauri's default menu.
    with_commands(tauri::Builder::default())
        // First, so a second launch quits before setting anything up.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| match file_in_args(&args, Path::new(&cwd)) {
            Some(path) => hand_over(app, path),
            None => show_main_window(app),
        }))
        // log::* from Rust and the frontend's warnings (src/lib/log.ts), into
        // the app's log folder (ヘルプ › ログを表示) and stdout.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some(LOG_FILE.into()),
                    }),
                ])
                .max_file_size(1_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(2))
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Size, place and maximized, kept between launches. Not fullscreen
        // or hidden: the app always opens as a visible, ordinary window.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .setup(|app| {
            log_panics();
            log::info!(
                "Markdown Viewer {} ({} {})",
                app.package_info().version,
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            if let Some(path) = file_in_args(&args, &cwd) {
                *app.state::<AppState>().pending.lock().map_err(|e| e.to_string())? = Some(path);
            }
            watch(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS: a .md opened from Finder (also the one that launched the app).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                if let Some(path) = urls.iter().find_map(|u| u.to_file_path().ok()) {
                    hand_over(_app, path.display().to_string());
                }
            }
        });
}
