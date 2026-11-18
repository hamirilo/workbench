//! The commands called through IPC with the arguments the frontend sends
//! (src/lib/api.ts): argument names, camelCase fields and answers checked
//! end to end, on Tauri's mock runtime.

use serde_json::{json, Value};
use std::fs;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, WebviewWindow, WebviewWindowBuilder};

/// The app's own page, which may call its commands.
#[cfg(windows)]
const LOCAL: &str = "http://tauri.localhost";
#[cfg(not(windows))]
const LOCAL: &str = "tauri://localhost";

fn next() -> u128 {
    static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    N.fetch_add(1, std::sync::atomic::Ordering::Relaxed) as u128
}

struct Ui {
    _app: App<tauri::test::MockRuntime>,
    webview: WebviewWindow<tauri::test::MockRuntime>,
}

fn ui() -> Ui {
    let mut context = mock_context(noop_assets());
    // Its own app folders, apart from other tests.
    context.config_mut().identifier =
        format!("dev.workbench.markdown-viewer.test-{}", std::process::id() as u128 * 1000 + next());
    let app = markdown_viewer_lib::with_commands(mock_builder()).build(context).expect("app");
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window");
    Ui { _app: app, webview }
}

impl Ui {
    fn call(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: LOCAL.parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|b| b.deserialize::<Value>().unwrap())
    }
}

#[test]
fn open_a_file_and_what_it_points_at() {
    let tmp = tempfile::tempdir().unwrap();
    let r = tmp.path();
    fs::create_dir_all(r.join("img")).unwrap();
    fs::write(r.join("img/図.png"), b"\x89PNG\r\n\x1a\nrest").unwrap();
    fs::write(r.join("img/偽物.png"), b"MZ program").unwrap();
    fs::write(r.join("次.md"), "# 次\n").unwrap();
    fs::write(r.join("表.xlsx"), b"PK").unwrap();
    let md = r.join("手順.md");
    fs::write(&md, "# 手順\n\n![図](img/図.png)\n").unwrap();
    let ui = ui();

    // Nothing open yet.
    assert!(ui.call("read_image", json!({ "src": "img/図.png" })).is_err());
    assert_eq!(ui.call("take_pending_file", json!({})).unwrap(), Value::Null);

    let d = ui.call("open_doc", json!({ "path": md })).unwrap();
    assert_eq!(d["name"], "手順.md");
    assert_eq!(d["encoding"], "UTF-8");
    assert!(d["html"].as_str().unwrap().contains(r#"<h1 id="手順">"#));
    assert!(d["modified"].as_u64().unwrap() > 0);

    // Pictures next to it, by their bytes.
    let img = ui.call("read_image", json!({ "src": "img/%E5%9B%B3.png" })).unwrap();
    assert!(img.as_str().unwrap().starts_with("data:image/png;base64,"));
    assert!(ui.call("read_image", json!({ "src": "img/偽物.png" })).is_err());
    assert!(ui.call("read_image", json!({ "src": "https://example.com/a.png" })).is_err());

    // A link to another Markdown file is opened in the app.
    let next = ui.call("follow_link", json!({ "href": "次.md#次" })).unwrap();
    assert_eq!(next.as_str().unwrap(), r.join("次.md").display().to_string());
    let e = ui.call("follow_link", json!({ "href": "無い.md" })).unwrap_err();
    assert!(e.as_str().unwrap().contains("見つかりません"), "{e}");

    // Only web and mail links go to the browser.
    let e = ui.call("open_url", json!({ "url": "file:///etc/passwd" })).unwrap_err();
    assert!(e.as_str().unwrap().contains("開けません"), "{e}");

    ui.call("close_doc", json!({})).unwrap();
    assert!(ui.call("reveal_doc", json!({})).is_err());
}

#[test]
fn errors_that_read() {
    let ui = ui();
    let e = ui.call("open_doc", json!({ "path": "/no/such/file.md" })).unwrap_err();
    assert!(e.as_str().unwrap().contains("見つかりません"), "{e}");
    let s = ui.call("get_app_settings", json!({})).unwrap();
    assert_eq!(s["autoUpdate"], true);
}
