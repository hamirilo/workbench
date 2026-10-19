// The desktop app: the Rust commands through Tauri's `invoke`, the OS's own
// dialogs. Everything can be done here.
import { invoke } from "@tauri-apps/api/core";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import type { AppSettings, Draft, ImageInfo, OpenedPdf, Saved, Stamp, TextLine } from "../lib/api";
import type { Backend, Dialogs, Host } from "./types";

const bytes = (r: ArrayBuffer | Uint8Array | number[]) =>
  r instanceof Uint8Array ? r : r instanceof ArrayBuffer ? new Uint8Array(r) : new Uint8Array(r);

const backend: Backend = {
  getAppSettings: () => invoke<AppSettings>("get_app_settings"),
  setAppSettings: (settings) => invoke<AppSettings>("set_app_settings", { settings }),
  osUserName: () => invoke<string>("os_user_name"),
  textFontFamily: () => invoke<string | null>("text_font_family"),
  systemProxy: (url) => invoke<string | null>("system_proxy", { url }),
  revealLog: () => invoke<void>("reveal_log"),
  openReleasePage: (version) => invoke<void>("open_release_page", { version }),
  revealBackups: () => invoke<void>("reveal_backups"),
  revealFile: (path) => invoke<void>("reveal_file", { path }),
  takeOpenRequests: () => invoke<string[]>("take_open_requests"),

  openPdf: (path) => invoke<OpenedPdf>("open_pdf", { path }),
  pdfViewBytes: async (id) => bytes(await invoke<ArrayBuffer>("pdf_view_bytes", { id })),
  closePdf: (id) => invoke<void>("close_pdf", { id }),
  savePdf: (request) => invoke<Saved>("save_pdf", { request }),
  textLines: (id, index) => invoke<TextLine[]>("text_lines", { id, index }),
  composePdf: async (request) => bytes(await invoke<ArrayBuffer>("compose_pdf", { request })),

  addImage: (path) => invoke<ImageInfo>("add_image", { path }),
  addImageBytes: (data) => invoke<ImageInfo>("add_image_bytes", data),
  imageBytes: async (id) => bytes(await invoke<ArrayBuffer>("image_bytes", { id })),
  listStamps: () => invoke<Stamp[]>("list_stamps"),
  addStamp: (path) => invoke<Stamp>("add_stamp", { path }),
  addStampBytes: (data) => invoke<Stamp>("add_stamp_bytes", data),

  writeDraft: (request) => invoke<string>("write_draft", { request }),
  listDrafts: () => invoke<Draft[]>("list_drafts"),
  removeDraft: (id) => invoke<void>("remove_draft", { id }),
  removeStamp: (id) => invoke<void>("remove_stamp", { id }),
  useStamp: (id) => invoke<ImageInfo>("use_stamp", { id }),
};

const dialogs: Dialogs = {
  async openFiles({ title, filters, multiple }) {
    const picked = await open({ title, filters, multiple: !!multiple });
    if (!picked) return null;
    return Array.isArray(picked) ? picked : [picked];
  },
  async openFolder({ title }) {
    const picked = await open({ title, directory: true });
    return typeof picked === "string" ? picked : null;
  },
  async saveAs({ title, defaultPath, filters }) {
    return (await save({ title, defaultPath, filters })) || null;
  },
  async message(text, { title, kind, buttons = [] } = {}) {
    // The plugin's own words for the button pressed ("Yes", "Ok"…) are turned
    // back into the labels given, so callers compare with what they passed.
    const [a, b, c] = buttons;
    const labels = buttons.length === 1 ? { ok: a } : buttons.length === 2 ? { ok: a, cancel: b } : buttons.length === 3 ? { yes: a, no: b, cancel: c } : undefined;
    const r = await message(text, { title, kind, buttons: labels });
    if (!buttons.length) return r;
    if (buttons.includes(r)) return r;
    if (r === "Ok" || r === "Yes") return buttons[0];
    if (r === "No") return buttons[1];
    return buttons[buttons.length - 1];
  },
  ask: (text, { title, okLabel, cancelLabel } = {}) => ask(text, { title, okLabel, cancelLabel }),
};

export const desktopHost: Host = {
  kind: "desktop",
  backend,
  dialogs,
  can: { overwrite: true, folders: true, reveal: true, recent: true, updates: true },
};
