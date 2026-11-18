// Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
// Components call these, never `invoke` directly; the browser mock
// (src/dev/mockBackend.ts) answers the same names.
import { invoke } from "@tauri-apps/api/core";

/** settings.json (src-tauri/src/settings.rs). */
export interface AppSettings {
  autoUpdate: boolean;
}

/** A file read and rendered (src-tauri/src/doc.rs `Doc`). */
export interface Doc {
  path: string;
  name: string;
  /** Rendered by comrak: raw HTML in the file is left out. */
  html: string;
  /** The text as written in the file (copied; shown in the Markdown view). */
  source: string;
  encoding: "UTF-8" | "Shift_JIS";
  size: number;
  /** Last saved, ms since 1970; 0 if unknown. */
  modified: number;
}

/** Extensions the open dialog offers (src-tauri/src/doc.rs `EXTENSIONS`). */
export const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "txt"];

export const api = {
  getAppSettings: () => invoke<AppSettings>("get_app_settings"),
  setAppSettings: (settings: AppSettings) => invoke<AppSettings>("set_app_settings", { settings }),
  systemProxy: () => invoke<string | null>("system_proxy"),
  revealLog: () => invoke<void>("reveal_log"),
  /** The GitHub release page of `version` (what changed), in the browser. */
  openReleasePage: (version: string) => invoke<void>("open_release_page", { version }),

  /** Reads and renders `path`; from then on `doc-changed` tells of saves. */
  openDoc: (path: string) => invoke<Doc>("open_doc", { path }),
  closeDoc: () => invoke<void>("close_doc"),
  /** The file the OS handed over at launch, once. */
  takePendingFile: () => invoke<string | null>("take_pending_file"),
  /** A picture next to the file on screen, as a data: URL. */
  readImage: (src: string) => invoke<string>("read_image", { src }),
  /** A link to a file: a Markdown file's path to open, or null (shown in Finder / Explorer). */
  followLink: (href: string) => invoke<string | null>("follow_link", { href }),
  /** http(s) and mailto links, in the browser. */
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  revealDoc: () => invoke<void>("reveal_doc"),
};
