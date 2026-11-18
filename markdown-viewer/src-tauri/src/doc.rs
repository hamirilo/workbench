//! The file on screen: reading it, the pictures and links it points at, and
//! noticing when it is saved again. Nothing here ever writes to the user's
//! files (a viewer only: CLAUDE.md).

use crate::render::{self, MAX_DOC};
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Extensions opened as Markdown: in the open dialog, by a drop, and by a link.
pub const EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "txt"];

pub fn is_markdown(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()).is_some_and(|e| EXTENSIONS.iter().any(|x| x.eq_ignore_ascii_case(e)))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Doc {
    pub path: String,
    pub name: String,
    pub html: String,
    /// The file's text as written (for copying and the Markdown view).
    pub source: String,
    pub encoding: &'static str,
    pub size: u64,
    /// When it was last saved (ms since 1970); 0 if the OS doesn't say.
    pub modified: u64,
}

/// What `open` compares to notice a save: the time and the size.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stamp {
    pub modified: Option<SystemTime>,
    pub len: u64,
}

pub fn stamp(path: &Path) -> Option<Stamp> {
    let m = fs::metadata(path).ok()?;
    Some(Stamp { modified: m.modified().ok(), len: m.len() })
}

fn ms(t: Option<SystemTime>) -> u64 {
    t.and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64)
}

/// Reads and renders `path`. The messages are for the user.
pub fn open(path: &Path) -> Result<(Doc, Stamp), String> {
    let shown = path.display();
    let meta = fs::metadata(path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => format!("{shown} は見つかりません"),
        _ => format!("{shown} を開けませんでした: {e}"),
    })?;
    if meta.is_dir() {
        return Err(format!("{shown} はフォルダです。Markdown のファイルを選んでください"));
    }
    if meta.len() > MAX_DOC {
        return Err(format!("{shown} は大きすぎて開けません（{} MB まで）", MAX_DOC / 1024 / 1024));
    }
    let bytes = fs::read(path).map_err(|e| format!("{shown} を読めませんでした: {e}"))?;
    // A picture or a program renamed .md would come out as pages of noise.
    if bytes.contains(&0) {
        return Err(format!("{shown} はテキストのファイルではないようです"));
    }
    let (text, encoding) = render::decode(&bytes);
    let stamp = Stamp { modified: meta.modified().ok(), len: meta.len() };
    let doc = Doc {
        path: path.display().to_string(),
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        html: render::to_html(&text),
        source: text,
        encoding,
        size: meta.len(),
        modified: ms(stamp.modified),
    };
    Ok((doc, stamp))
}

/// A link or picture address as written in the file, as a file next to
/// `doc`. None for web addresses and in-page anchors (`#見出し`).
pub fn local_target(doc: &Path, href: &str) -> Option<PathBuf> {
    let href = href.split(['#', '?']).next().unwrap_or("");
    if href.is_empty() {
        return None;
    }
    let href = if let Some(rest) = href.strip_prefix("file://") {
        rest
    } else if href.contains("://") || href.starts_with("mailto:") || href.starts_with("data:") {
        return None;
    } else {
        href
    };
    let decoded = percent_decode(href);
    let p = Path::new(&decoded);
    Some(if p.is_absolute() { p.to_path_buf() } else { doc.parent()?.join(p) })
}

/// `%20` and the like, as editors write spaces and Japanese into links.
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = |c: u8| (c as char).to_digit(16);
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_owned())
}

/// Pictures larger than this are shown as missing.
pub const MAX_IMAGE: u64 = 20 * 1024 * 1024;

/// The picture's type from its first bytes, not its name (Platform Security §4).
fn image_type(bytes: &[u8]) -> Option<&'static str> {
    let starts = |p: &[u8]| bytes.starts_with(p);
    if starts(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if starts(b"\xFF\xD8\xFF") {
        Some("image/jpeg")
    } else if starts(b"GIF87a") || starts(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() > 12 && starts(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if starts(b"BM") {
        Some("image/bmp")
    } else if bytes.len() > 12 && &bytes[4..8] == b"ftyp" && (&bytes[8..12] == b"avif" || &bytes[8..12] == b"avis") {
        Some("image/avif")
    } else if is_svg(bytes) {
        // Shown through <img>: scripts in it don't run and it loads nothing else.
        Some("image/svg+xml")
    } else {
        None
    }
}

fn is_svg(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(1024)];
    let text = String::from_utf8_lossy(head);
    let t = text.trim_start_matches('\u{FEFF}').trim_start();
    t.starts_with('<') && text.contains("<svg")
}

/// A picture next to the file, as a `data:` URL for the page.
pub fn image(path: &Path) -> Result<String, String> {
    let shown = path.display();
    let len = fs::metadata(path).map_err(|_| format!("{shown} は見つかりません"))?.len();
    if len > MAX_IMAGE {
        return Err(format!("{shown} は大きすぎて表示しません"));
    }
    let bytes = fs::read(path).map_err(|e| format!("{shown} を読めませんでした: {e}"))?;
    let mime = image_type(&bytes).ok_or_else(|| format!("{shown} は表示できる画像ではありません"))?;
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn targets_next_to_the_file() {
        let doc = Path::new("/docs/手順/README.md");
        assert_eq!(local_target(doc, "img/図 1.png"), Some(PathBuf::from("/docs/手順/img/図 1.png")));
        assert_eq!(local_target(doc, "img/%E5%9B%B3%201.png"), Some(PathBuf::from("/docs/手順/img/図 1.png")));
        assert_eq!(local_target(doc, "../other.md#概要"), Some(PathBuf::from("/docs/手順/../other.md")));
        assert_eq!(local_target(doc, "file:///tmp/a.md"), Some(PathBuf::from("/tmp/a.md")));
        assert_eq!(local_target(doc, "https://example.com/a.png"), None);
        assert_eq!(local_target(doc, "mailto:a@example.com"), None);
        assert_eq!(local_target(doc, "#概要"), None);
        assert_eq!(percent_decode("a%2"), "a%2");
    }

    #[test]
    fn pictures_by_their_bytes() {
        assert_eq!(image_type(b"\x89PNG\r\n\x1a\n...."), Some("image/png"));
        assert_eq!(image_type(b"<?xml version=\"1.0\"?>\n<svg xmlns=\"\"/>"), Some("image/svg+xml"));
        assert_eq!(image_type(b"MZ\x90\x00 a program"), None);
        assert_eq!(image_type(b"<html><body>"), None);
    }

    #[test]
    fn open_and_refuse() {
        let dir = tempfile::tempdir().unwrap();
        let md = dir.path().join("メモ.md");
        fs::write(&md, "# 見出し\n").unwrap();
        let (doc, stamp) = open(&md).unwrap();
        assert_eq!(doc.name, "メモ.md");
        assert!(doc.html.contains("<h1"));
        assert_eq!(doc.source, "# 見出し\n");
        assert_eq!(stamp.len, 12);

        assert!(open(dir.path()).unwrap_err().contains("フォルダ"));
        assert!(open(&dir.path().join("無い.md")).unwrap_err().contains("見つかりません"));
        let bin = dir.path().join("x.md");
        fs::write(&bin, b"\x89PNG\x00\x00").unwrap();
        assert!(open(&bin).unwrap_err().contains("テキスト"));
    }

    #[test]
    fn markdown_extensions() {
        assert!(is_markdown(Path::new("a/README.MD")));
        assert!(!is_markdown(Path::new("a/setup.exe")));
    }
}
