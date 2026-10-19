// The commands the screens call (src-tauri/src/commands.rs in the desktop
// app) and their types. Components call `api`, never `invoke` directly; it
// hands every call to the host's backend (src/host/), so the desktop app,
// the browser version and the mock (src/dev/mockHost.ts) answer the same names.
import { host } from "../host";
import type { Backend } from "../host";

/** settings.json (src-tauri/src/settings.rs). */
export interface AppSettings {
  autoUpdate: boolean;
  /** The name written on annotations; empty = the OS user name. */
  author: string;
  /** Newest first. */
  recent: string[];
  /** First-run tips already shown (src/components/Tips.tsx). */
  seenTips: string[];
}

export type AnnotKind =
  | "highlight"
  | "underline"
  | "strikeout"
  | "ink"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "note"
  | "image"
  | "seal"
  // A line of the page's own text that was fixed (docs/SPEC.md §文字を直す).
  | "edit";

/**
 * An annotation (src-tauri/src/pdf/mod.rs `Annot`). Coordinates are in the
 * page's PDF space: points, origin bottom left, before the page's rotation.
 */
export interface Annot {
  id: string;
  kind: AnnotKind;
  /** "#rrggbb": stroke, marker or text. */
  color: string;
  opacity: number;
  /** Line width in points; for text boxes the border (0 = none). */
  width: number;
  fill: string | null;
  /** [x1, y1, x2, y2], x1 < x2, y1 < y2. */
  rect: [number, number, number, number] | null;
  /** Text markup: per line, upper left, upper right, lower left, lower right. */
  quads: number[][];
  /** Ink strokes: x, y, x, y… */
  paths: number[][];
  /** Lines and arrows: x1, y1, x2, y2; the arrow head is at the end. */
  line: [number, number, number, number] | null;
  text: string;
  /** The text box's lines as wrapped on screen; filled in when saving. */
  lines: string[];
  fontSize: number;
  /** Text boxes and pictures: 0, 90, 180 or 270. */
  rotation: number;
  /** A picture in Rust's image store. */
  image: number | null;
  /** A seal the app draws: "round" (a date seal, three lines) or "box" (a word). Its words are `text`, one per line. */
  seal: "round" | "box" | null;
  /**
   * An `edit`'s old line: the page-content operators that drew it (a
   * `TextLine`'s `ops`). Then `text` is what it says now, `lines[0]` what it
   * said, `rect` the old line's box, `fill` the page's colour behind it
   * (to hide the old text on screen), `fontSize` and `color` as drawn now.
   */
  runs: number[];
  /** The comment. */
  contents: string;
  author: string;
  /** PDF date (D:YYYYMMDDHHmmSS…). */
  modified: string;
}

/** A line of the page's own text (src-tauri/src/pdf/textedit.rs `Line`). */
export interface TextLine {
  ops: number[];
  text: string;
  /** [x1, y1, x2, y2] around the line, in the page's PDF space. */
  rect: [number, number, number, number];
  size: number;
  color: string;
  font: string;
  /** The characters the line's font can write; null: too many to list. New text in them keeps the font. */
  chars: string | null;
  editable: boolean;
  /** Why it can't be fixed (Japanese, for the user). */
  why: string;
}

export interface PageAnnot {
  /** The page's index in its document. */
  page: number;
  annot: Annot;
}

export interface OpenedPdf {
  id: number;
  path: string;
  name: string;
  size: number;
  /** Why it can only be viewed; null when it can be edited. */
  readOnly: string | null;
  /** Has a digital signature, which saving breaks. */
  signed: boolean;
  annots: PageAnnot[];
}

/** A page of the file to write (src-tauri/src/pdf/compose.rs `PageSpec`). */
export interface PageSpec {
  /** The opened document; null for a blank page. */
  source: number | null;
  index: number;
  /** Added to the page's own rotation. */
  rotate: number;
  /** A blank page's size in points. */
  size: [number, number] | null;
  annots: Annot[];
}

/** A form value typed in (pdf.js's annotation storage). */
export interface FormEntry {
  source: number;
  /** pdf.js's widget id ("12R"). */
  id: string;
  value: boolean | string | string[];
}

export interface Saved {
  path: string;
  size: number;
  /** The file it replaced, kept in the backups folder. */
  backup: string | null;
}

export interface ImageInfo {
  id: number;
  width: number;
  height: number;
}

/** A picture in the stamp library. */
export interface Stamp {
  id: string;
  name: string;
}

/** A tab's draft kept while editing (src-tauri/src/files.rs `Draft`). */
export interface Draft {
  id: string;
  /** The file the tab was opened from. */
  path: string;
  /** Milliseconds since 1970. */
  savedAt: number;
  /** The tab's state as src/lib/drafts.ts wrote it. */
  json: string;
  /** Image store id → the picture's file in the draft's folder. */
  images: [number, string][];
}

export const api: Backend = {
  getAppSettings: () => host().backend.getAppSettings(),
  setAppSettings: (settings) => host().backend.setAppSettings(settings),
  osUserName: () => host().backend.osUserName(),
  textFontFamily: () => host().backend.textFontFamily(),
  systemProxy: (url) => host().backend.systemProxy(url),
  revealLog: () => host().backend.revealLog(),
  openReleasePage: (version) => host().backend.openReleasePage(version),
  revealBackups: () => host().backend.revealBackups(),
  revealFile: (path) => host().backend.revealFile(path),
  takeOpenRequests: () => host().backend.takeOpenRequests(),

  openPdf: (path) => host().backend.openPdf(path),
  pdfViewBytes: (id) => host().backend.pdfViewBytes(id),
  closePdf: (id) => host().backend.closePdf(id),
  savePdf: (request) => host().backend.savePdf(request),
  textLines: (id, index) => host().backend.textLines(id, index),
  composePdf: (request) => host().backend.composePdf(request),

  addImage: (path) => host().backend.addImage(path),
  addImageBytes: (data) => host().backend.addImageBytes(data),
  imageBytes: (id) => host().backend.imageBytes(id),
  listStamps: () => host().backend.listStamps(),
  addStamp: (path) => host().backend.addStamp(path),
  addStampBytes: (data) => host().backend.addStampBytes(data),

  writeDraft: (request) => host().backend.writeDraft(request),
  listDrafts: () => host().backend.listDrafts(),
  removeDraft: (id) => host().backend.removeDraft(id),
  removeStamp: (id) => host().backend.removeStamp(id),
  useStamp: (id) => host().backend.useStamp(id),
};
