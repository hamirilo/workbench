//! Markdown → HTML. The file is anyone's (Platform Security §4): raw HTML in
//! it is left out and `javascript:` links are dropped by comrak, so what
//! reaches the page is only what Markdown itself can make.

use comrak::{markdown_to_html, Options};

/// Larger files are refused: rendering holds the whole text, its tree and
/// the HTML at once (release builds abort when memory runs out).
pub const MAX_DOC: u64 = 16 * 1024 * 1024;

/// The text and the encoding it was read as ("UTF-8" / "Shift_JIS").
pub fn decode(bytes: &[u8]) -> (String, &'static str) {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    if let Ok(s) = std::str::from_utf8(bytes) {
        return (s.to_owned(), "UTF-8");
    }
    // Not UTF-8: most likely a file saved on Japanese Windows. Anything that
    // isn't Shift_JIS either comes out with replacement characters.
    let (s, _, _) = encoding_rs::SHIFT_JIS.decode(bytes);
    (s.into_owned(), "Shift_JIS")
}

fn options() -> Options<'static> {
    let mut o = Options::default();
    // GitHub Flavored Markdown, as most README and notes are written.
    o.extension.strikethrough = true;
    o.extension.table = true;
    o.extension.autolink = true;
    o.extension.tasklist = true;
    o.extension.footnotes = true;
    // Headings get ids, for the outline and for `#見出し` links. No prefix:
    // links written in the file use the bare id.
    o.extension.header_id_prefix = Some(String::new());
    // Front matter (--- at the top) isn't shown as text.
    o.extension.front_matter_delimiter = Some("---".into());
    o.render.tasklist_classes = true;
    // Raw HTML in the file is not passed through (see the module comment).
    o.render.r#unsafe = false;
    o
}

pub fn to_html(md: &str) -> String {
    markdown_to_html(md, &options())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gfm_is_rendered() {
        let html = to_html("# 見積の手順\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] 済み\n- [ ] まだ\n\n~~消し~~ https://example.com\n");
        assert!(html.contains(r#"<h1 id="見積の手順">"#), "{html}");
        assert!(html.contains("<table>"), "{html}");
        assert!(html.contains(r#"type="checkbox""#), "{html}");
        assert!(html.contains("<del>消し</del>"), "{html}");
        assert!(html.contains(r#"<a href="https://example.com">"#), "{html}");
    }

    #[test]
    fn same_headings_get_different_ids() {
        let html = to_html("## 概要\n\n## 概要\n");
        assert!(html.contains(r#"id="概要""#) && html.contains(r#"id="概要-1""#), "{html}");
    }

    #[test]
    fn raw_html_and_script_links_do_not_get_through() {
        let html = to_html("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n");
        assert!(!html.contains("<script"), "{html}");
        assert!(!html.contains("onerror"), "{html}");
        assert!(!html.contains("javascript:"), "{html}");
    }

    #[test]
    fn front_matter_is_not_shown() {
        let html = to_html("---\ntitle: x\n---\n\n本文\n");
        assert!(!html.contains("title"), "{html}");
        assert!(html.contains("本文"));
    }

    #[test]
    fn encodings() {
        assert_eq!(decode("\u{FEFF}見出し".as_bytes()), ("見出し".into(), "UTF-8"));
        let (sjis, _, _) = encoding_rs::SHIFT_JIS.encode("議事録");
        assert_eq!(decode(&sjis), ("議事録".into(), "Shift_JIS"));
    }
}
