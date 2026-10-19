// The browser: the PDF code as WebAssembly (docs/WASM.md), the file chooser
// and drops for opening, downloads for saving, questions inside the page.
// What it keeps (settings, the stamp library, drafts) lives in memory only:
// it is gone when the page closes.
import type { AppSettings, Draft, ImageInfo, OpenedPdf, Stamp } from "../../lib/api";
import { browserFile, registerFile } from "../../lib/browserFiles";
import type { Backend, Capabilities, Dialogs, Host } from "../types";
import { call, loadEngine, type Engine } from "./engine";
import { promptDialogs } from "./prompt";

export interface WebHostOptions {
  /** The engine's script (wasm-bindgen's `pdf_one_wasm.js`). */
  engineUrl: string;
  /** Its `pdf_one_wasm_bg.wasm`. */
  wasmUrl: string;
  /** Noto Sans JP Regular (SIL OFL 1.1), a static TrueType: the subsetter can't do variable fonts. */
  fontUrl: string;
}

/** What the browser can't do: no way to write over a file, open a folder or show a file. */
export const webCan: Capabilities = { overwrite: false, folders: false, reveal: false, recent: false, updates: false };

/**
 * The CSS family the font for written text (the browser can't read the
 * OS's fonts as the app does) is registered under, so the screen matches the file.
 */
const FAMILY = "Noto Sans JP (PDF One)";

const unsupported = () => Promise.reject("ブラウザ版ではできません");

function pickFiles(accept: string, multiple: boolean): Promise<string[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => {
      const paths = Array.from(input.files ?? [], registerFile);
      resolve(paths.length ? paths : null);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

async function read(path: string): Promise<Uint8Array> {
  const f = browserFile(path);
  if (!f) throw "ブラウザ版では、選んだファイルかドロップしたファイルしか開けません";
  return new Uint8Array(await f.arrayBuffer());
}

function download(bytes: Uint8Array, path: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  a.download = path.split("/").pop() || "document.pdf";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

const dialogs: Dialogs = {
  async openFiles({ filters, multiple }) {
    const exts = filters?.flatMap((f) => f.extensions) ?? [];
    return pickFiles(exts.map((e) => `.${e}`).join(","), !!multiple);
  },
  openFolder: async () => null,
  // Saving is a download, which the browser asks about itself: keep the name.
  saveAs: async ({ defaultPath }) => (defaultPath ? fileName(defaultPath) : "document.pdf"),
  ...promptDialogs,
};

async function loadFont(engine: Engine, fontUrl: string): Promise<string | null> {
  const res = await fetch(fontUrl);
  if (!res.ok) {
    console.warn(`${fontUrl} を読めません。書き込む文字は Helvetica になり、日本語は出ません`);
    return null;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!engine.setFont(bytes.slice(), FAMILY)) {
    console.warn(`${fontUrl} は使えないフォントです`);
    return null;
  }
  const face = new FontFace(FAMILY, bytes);
  document.fonts.add(await face.load());
  return FAMILY;
}

function createBackend(engine: Engine, fontFamily: string | null): Backend {
  let settings: AppSettings = { autoUpdate: false, author: "", recent: [], seenTips: [] };
  const stamps = new Map<string, Stamp & { img: ImageInfo }>();
  const drafts = new Map<string, Draft>();

  const addStamp = (bytes: Uint8Array, name: string): Stamp => {
    const img: ImageInfo = JSON.parse(call(() => engine.addImage(bytes)));
    const id = `${String(stamps.size + 1).padStart(4, "0")}_${name}`;
    stamps.set(id, { id, name, img });
    return { id, name };
  };

  return {
    getAppSettings: async () => settings,
    setAppSettings: async (s) => (settings = { ...s, recent: [] }),
    osUserName: async () => "",
    textFontFamily: async () => fontFamily,
    systemProxy: async () => null,
    revealLog: unsupported,
    openReleasePage: unsupported,
    revealBackups: unsupported,
    revealFile: unsupported,
    takeOpenRequests: async () => [],

    async openPdf(path) {
      const file = await read(path);
      const r = JSON.parse(call(() => engine.open(file)));
      const opened: OpenedPdf = { id: r.id, path, name: fileName(path), size: file.length, readOnly: r.readOnly, signed: r.signed, annots: r.annots };
      return opened;
    },
    pdfViewBytes: async (id) => call(() => engine.takeView(id)),
    closePdf: async (id) => engine.close(id),
    async savePdf(request) {
      const started = performance.now();
      const bytes = call(() => engine.compose(JSON.stringify(request)));
      console.info(`保存（WASM）: ${request.path}、${bytes.length} バイト、${Math.round(performance.now() - started)} ms`);
      download(bytes, request.path);
      return { path: request.path, size: bytes.length, backup: null };
    },
    textLines: async (id, index) => JSON.parse(call(() => engine.textLines(id, index))),
    composePdf: async (request) => call(() => engine.compose(JSON.stringify(request))),

    async addImage(path) {
      const bytes = await read(path);
      return JSON.parse(call(() => engine.addImage(bytes)));
    },
    addImageBytes: async (data) => JSON.parse(call(() => engine.addImage(data))),
    imageBytes: async (id) => call(() => engine.imageBytes(id)),
    listStamps: async () => [...stamps.values()].map(({ id, name }) => ({ id, name })),
    addStamp: async (path) => addStamp(await read(path), fileName(path).replace(/\.[^.]+$/, "")),
    addStampBytes: async (data) => addStamp(data, "署名"),
    removeStamp: async (id) => void stamps.delete(id),
    async useStamp(id) {
      const s = stamps.get(id);
      if (!s) throw "スタンプが見つかりません";
      return s.img;
    },

    async writeDraft({ path, json }) {
      const id = Array.from(path).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16);
      drafts.set(id, { id, path, savedAt: Date.now(), json, images: [] });
      return id;
    },
    listDrafts: async () => [...drafts.values()],
    removeDraft: async (id) => void drafts.delete(id),
  };
}

/**
 * The browser host. Throws when the engine can't be loaded (the caller
 * decides what to do then); a font that can't be loaded only costs the
 * Japanese in written text.
 */
export async function createWebHost(options: WebHostOptions): Promise<Host> {
  const started = performance.now();
  const engine = await loadEngine(options.engineUrl, options.wasmUrl);
  const font = await loadFont(engine, options.fontUrl).catch((e) => {
    console.warn(`フォントを読み込めません: ${e}`);
    return null;
  });
  console.info(`WASM の準備: ${Math.round(performance.now() - started)} ms（フォント: ${font ?? "なし"}）`);
  return { kind: "web", backend: createBackend(engine, font), dialogs, can: webCan };
}
