//! Where this build looks for updates, and the release page of a version.
//!
//! Both come from the first of `plugins.updater.endpoints` in tauri.conf.json,
//! or of the config a fork lays over it with `tauri build --config` (the
//! repository's README, 「フォークで使うとき」). A fork then only sets the
//! endpoint: the proxy lookup and the release page follow it.

use tauri::{AppHandle, Runtime};

/// The update feed of this build: `latest.json` on a fixed release of the
/// repository (the repository's other tools share its releases, so
/// `releases/latest` can't be used).
pub fn update_feed<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let updater = app.config().plugins.0.get("updater")?;
    updater.get("endpoints")?.get(0)?.as_str().map(str::to_owned)
}

/// The release page of `version` next to `feed`. The feed is on the fixed
/// release `<name>-updater` and each version is released as `<name>-v<version>`
/// in the same repository: `disk-analyzer-updater` gives `disk-analyzer-v1.2.3`, and a fork's
/// `corp-disk-analyzer-updater` gives `corp-disk-analyzer-v1.2.3`. Only a version goes into the
/// URL, so the page can't be sent anywhere else. A feed of another shape has no
/// page.
pub fn release_page(feed: &str, version: &str) -> Result<String, String> {
    let version = version.strip_prefix('v').unwrap_or(version);
    let ok = !version.is_empty() && version.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'));
    if !ok {
        return Err(format!("not a version: {version}"));
    }
    let name_ok =
        |p: &str| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    let parts = feed.strip_prefix("https://github.com/").and_then(|rest| {
        let parts: Vec<&str> = rest.split('/').collect();
        match parts[..] {
            [owner, repo, "releases", "download", release, "latest.json"] => {
                Some((owner, repo, release.strip_suffix("-updater")?))
            }
            _ => None,
        }
    });
    let (owner, repo, name) = parts
        .filter(|(owner, repo, name)| name_ok(owner) && name_ok(repo) && name_ok(name))
        .ok_or_else(|| "このビルドの更新の配信先には、更新内容のページがありません".to_string())?;
    Ok(format!("https://github.com/{owner}/{repo}/releases/tag/{name}-v{version}"))
}

#[cfg(test)]
mod tests {
    use super::release_page;

    const FEED: &str = "https://github.com/someone/apps/releases/download/disk-analyzer-updater/latest.json";

    #[test]
    fn takes_only_a_version() {
        let page = "https://github.com/someone/apps/releases/tag/disk-analyzer-v0.2.0";
        assert_eq!(release_page(FEED, "0.2.0").unwrap(), page);
        assert_eq!(release_page(FEED, "v0.2.0").unwrap(), page);
        assert!(release_page(FEED, "1.0.0-beta.1").is_ok());
        assert!(release_page(FEED, "").is_err());
        assert!(release_page(FEED, "0.2.0/../../evil").is_err());
        assert!(release_page(FEED, "0.2.0?x=1").is_err());
    }

    #[test]
    fn follows_the_feed() {
        let fork = "https://github.com/someone/apps-fork/releases/download/corp-disk-analyzer-updater/latest.json";
        assert_eq!(
            release_page(fork, "1.2.3").unwrap(),
            "https://github.com/someone/apps-fork/releases/tag/corp-disk-analyzer-v1.2.3"
        );
        for feed in [
            "",
            "https://example.com/someone/apps/releases/download/disk-analyzer-updater/latest.json",
            "https://github.com/someone/apps/releases/latest/download/latest.json",
            "https://github.com/someone/apps/releases/download/disk-analyzer-v1.0.0/latest.json",
            "https://github.com/someone/apps/releases/download/-updater/latest.json",
            "https://github.com/some one/apps/releases/download/disk-analyzer-updater/latest.json",
        ] {
            assert!(release_page(feed, "1.2.3").is_err(), "{feed}");
        }
    }

    #[test]
    fn the_shipped_config_has_a_release_page() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let feed = conf["plugins"]["updater"]["endpoints"][0].as_str().unwrap();
        assert_eq!(
            release_page(feed, "1.2.3").unwrap(),
            "https://github.com/hamirilo/workbench/releases/tag/disk-analyzer-v1.2.3"
        );
    }
}
