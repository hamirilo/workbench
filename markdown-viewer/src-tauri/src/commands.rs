//! Commands invoked from the frontend (src/lib/api.ts). All return
//! `Result<_, String>` with a message the user can read.

use crate::doc::{self, Doc, Stamp};
use crate::settings::{self, AppSettings};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

pub type CmdResult<T> = Result<T, String>;

pub(crate) fn err(e: impl ToString) -> String {
    e.to_string()
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> CmdResult<std::path::PathBuf> {
    Ok(settings::path(&app.path().app_config_dir().map_err(err)?))
}

#[tauri::command]
pub fn get_app_settings<R: Runtime>(app: AppHandle<R>) -> CmdResult<AppSettings> {
    Ok(settings::load(&settings_path(&app)?))
}

#[tauri::command]
pub fn set_app_settings<R: Runtime>(app: AppHandle<R>, settings: AppSettings) -> CmdResult<AppSettings> {
    let _guard = settings::LOCK.lock().unwrap_or_else(|e| e.into_inner());
    settings::save(&settings_path(&app)?, &settings).map_err(|e| format!("設定を保存できませんでした: {e}"))?;
    Ok(settings)
}

/// The proxy the OS would use for this build's update feed (PAC included),
/// for the updater (src/lib/update.ts): its HTTP client can't run PAC
/// scripts. None = direct.
#[tauri::command]
pub async fn system_proxy<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    let feed = crate::feed::update_feed(&app)?;
    tauri::async_runtime::spawn_blocking(move || crate::proxy::for_url(&feed)).await.ok().flatten()
}

/// Opens the GitHub release page of `version` in the browser. The update
/// dialog and the settings' アップデート section link there for what changed,
/// instead of showing the release notes in the app.
#[tauri::command]
pub fn open_release_page<R: Runtime>(app: AppHandle<R>, version: String) -> CmdResult<()> {
    let page = crate::feed::release_page(&crate::feed::update_feed(&app).unwrap_or_default(), &version)?;
    tauri_plugin_opener::open_url(page, None::<&str>).map_err(err)
}

/// ヘルプ › ログを表示: the log file in Finder / Explorer.
#[tauri::command]
pub fn reveal_log<R: Runtime>(app: AppHandle<R>) -> CmdResult<()> {
    let dir = app.path().app_log_dir().map_err(err)?;
    let file = dir.join(format!("{}.log", crate::LOG_FILE));
    if file.is_file() {
        tauri_plugin_opener::reveal_item_in_dir(file).map_err(err)
    } else {
        std::fs::create_dir_all(&dir).map_err(err)?;
        tauri_plugin_opener::open_path(dir, None::<&str>).map_err(err)
    }
}

// ---------------------------------------------------------------- the file

/// The file on screen and how it was when last read.
#[derive(Default)]
pub struct AppState {
    pub current: Mutex<Option<(PathBuf, Option<Stamp>)>>,
    /// A file the OS asked to open before the page was ready (a double-click
    /// on a .md that launched the app). The page takes it once it has loaded.
    pub pending: Mutex<Option<String>>,
}

impl AppState {
    fn current_path(&self) -> CmdResult<PathBuf> {
        let cur = self.current.lock().map_err(err)?;
        cur.as_ref().map(|(p, _)| p.clone()).ok_or_else(|| "ファイルを開いていません".into())
    }
}

/// Reads and renders `path`, and from then on watches it for saves.
#[tauri::command]
pub async fn open_doc<R: Runtime>(app: AppHandle<R>, path: String) -> CmdResult<Doc> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        let (doc, stamp) = doc::open(&path).inspect_err(|e| log::warn!("{e}"))?;
        *app.state::<AppState>().current.lock().map_err(err)? = Some((path, Some(stamp)));
        Ok(doc)
    })
    .await
    .map_err(err)?
}

/// Back to the start screen: nothing watched any more.
#[tauri::command]
pub fn close_doc(state: State<AppState>) -> CmdResult<()> {
    *state.current.lock().map_err(err)? = None;
    Ok(())
}

/// The file the OS handed over at launch, once.
#[tauri::command]
pub fn take_pending_file(state: State<AppState>) -> CmdResult<Option<String>> {
    Ok(state.pending.lock().map_err(err)?.take())
}

/// A picture the file points at (`![](img/a.png)`), as a `data:` URL.
/// Only next to the file on screen; web addresses aren't fetched.
#[tauri::command]
pub async fn read_image(state: State<'_, AppState>, src: String) -> CmdResult<String> {
    let current = state.current_path()?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = doc::local_target(&current, &src).ok_or("Web 上の画像は表示しません")?;
        doc::image(&path)
    })
    .await
    .map_err(err)?
}

/// A click on a link to a file. Markdown files are returned for the page to
/// open; anything else is shown in Finder / Explorer, never run.
#[tauri::command]
pub fn follow_link(state: State<AppState>, href: String) -> CmdResult<Option<String>> {
    let current = state.current_path()?;
    let path = doc::local_target(&current, &href).ok_or("ファイルへのリンクではありません")?;
    if !path.exists() {
        return Err(format!("{} は見つかりません", path.display()));
    }
    if path.is_file() && doc::is_markdown(&path) {
        return Ok(Some(path.display().to_string()));
    }
    reveal(&path)?;
    Ok(None)
}

/// A web link, in the browser. Only http(s) and mail.
#[tauri::command]
pub fn open_url(url: String) -> CmdResult<()> {
    let lower = url.to_ascii_lowercase();
    if !["http://", "https://", "mailto:"].iter().any(|s| lower.starts_with(s)) {
        return Err(format!("このリンクは開けません: {url}"));
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(err)
}

fn reveal(path: &Path) -> CmdResult<()> {
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| format!("{} を表示できませんでした: {e}", path.display()))
}

/// The file on screen in Finder / Explorer.
#[tauri::command]
pub fn reveal_doc(state: State<AppState>) -> CmdResult<()> {
    reveal(&state.current_path()?)
}

/// How often the file on screen is checked for a save. Checking the time
/// and size works the same on network shares, where change notifications
/// often don't arrive.
const POLL: Duration = Duration::from_millis(700);

/// Watches the file on screen; `doc-changed` when it was saved (or removed).
pub fn watch<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL);
        let state = app.state::<AppState>();
        let Some((path, old)) = state.current.lock().ok().and_then(|c| c.clone()) else { continue };
        let now = doc::stamp(&path);
        if now == old {
            continue;
        }
        // Editors write in steps (or save to a new file and swap it in):
        // wait for it to settle.
        std::thread::sleep(Duration::from_millis(150));
        if doc::stamp(&path) != now {
            continue;
        }
        let Ok(mut cur) = state.current.lock() else { continue };
        if cur.as_ref().map(|(p, _)| p) != Some(&path) {
            continue;
        }
        *cur = Some((path.clone(), now));
        drop(cur);
        let _ = app.emit("doc-changed", path.display().to_string());
    });
}
