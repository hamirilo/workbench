// What the screens need from where they run (ADR-0004): the PDF and file
// commands, the dialogs, and what can't be done there. The screens call
// these through `host()` and never Tauri or the browser directly.
import type { AppSettings, Draft, FormEntry, ImageInfo, OpenedPdf, PageSpec, Saved, Stamp, TextLine } from "../lib/api";

/**
 * The commands (src-tauri/src/commands.rs in the desktop app). `api` in
 * src/lib/api.ts hands every call to the host's.
 */
export interface Backend {
  getAppSettings(): Promise<AppSettings>;
  setAppSettings(settings: AppSettings): Promise<AppSettings>;
  osUserName(): Promise<string>;
  textFontFamily(): Promise<string | null>;
  systemProxy(url: string): Promise<string | null>;
  revealLog(): Promise<void>;
  /** The GitHub release page of `version` (what changed), in the browser. */
  openReleasePage(version: string): Promise<void>;
  revealBackups(): Promise<void>;
  revealFile(path: string): Promise<void>;
  takeOpenRequests(): Promise<string[]>;

  openPdf(path: string): Promise<OpenedPdf>;
  /** What pdf.js shows for document `id`; can be fetched once. */
  pdfViewBytes(id: number): Promise<Uint8Array>;
  closePdf(id: number): Promise<void>;
  savePdf(request: { path: string; pages: PageSpec[]; forms: FormEntry[] }): Promise<Saved>;
  textLines(id: number, index: number): Promise<TextLine[]>;
  /** The file as it would be saved, as bytes (printing). */
  composePdf(request: { pages: PageSpec[]; forms: FormEntry[] }): Promise<Uint8Array>;

  addImage(path: string): Promise<ImageInfo>;
  addImageBytes(data: Uint8Array): Promise<ImageInfo>;
  imageBytes(id: number): Promise<Uint8Array>;
  listStamps(): Promise<Stamp[]>;
  addStamp(path: string): Promise<Stamp>;
  /** A picture drawn in the app (a signature), as PNG bytes, into the library. */
  addStampBytes(data: Uint8Array): Promise<Stamp>;

  writeDraft(request: { path: string; json: string; images: number[] }): Promise<string>;
  listDrafts(): Promise<Draft[]>;
  removeDraft(id: string): Promise<void>;
  removeStamp(id: string): Promise<void>;
  useStamp(id: string): Promise<ImageInfo>;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface MessageOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
  /**
   * The buttons' labels, the default first (at most three). The last one is
   * the cancel: Esc and closing the dialog answer with it.
   */
  buttons?: string[];
}

export interface Dialogs {
  /** Files to open; null when nothing was chosen. */
  openFiles(options: { title?: string; filters?: FileFilter[]; multiple?: boolean }): Promise<string[] | null>;
  /** A folder to write into; null when cancelled. */
  openFolder(options: { title?: string }): Promise<string | null>;
  /** Where to write a file; null when cancelled. */
  saveAs(options: { title?: string; defaultPath?: string; filters?: FileFilter[] }): Promise<string | null>;
  /** Says something and waits; the answer is the label of the button pressed. */
  message(text: string, options?: MessageOptions): Promise<string>;
  /** A yes / no question. */
  ask(text: string, options?: { title?: string; okLabel?: string; cancelLabel?: string }): Promise<boolean>;
}

/** What the host can do; the screens leave out what it can't. */
export interface Capabilities {
  /** Writing over the original file, with the old version kept in the backups. */
  overwrite: boolean;
  /** Writing into a folder (splitting); without it, one file at a time. */
  folders: boolean;
  /** Showing a file, the log or the backups in the OS's file manager. */
  reveal: boolean;
  /** The recently used files. */
  recent: boolean;
  /** In-app updates. */
  updates: boolean;
}

export interface Host {
  kind: "desktop" | "web";
  backend: Backend;
  dialogs: Dialogs;
  can: Capabilities;
}
