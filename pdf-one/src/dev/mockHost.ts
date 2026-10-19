// Dev-only in-memory stand-in for the Rust backend, used when the UI is
// opened in a normal browser (`npm run dev`) with `?backend=mock`, without
// building the wasm (Platform playbook: ブラウザで UI を作る). Implements the
// same Backend as src/host/desktop.ts, closely enough for UI work; change
// both in the same PR. Every file "opened" is the same made-up sample (a
// few pages of text, a link and a small form); saving only logs. It can do
// what the browser version can (src/host/web/), and asks its questions the
// same way.
import type { AppSettings, Draft, ImageInfo, OpenedPdf, Stamp } from "../lib/api";
import { webCan } from "../host/web";
import { promptDialogs } from "../host/web/prompt";
import type { Backend, Dialogs, Host } from "../host/types";

let settings: AppSettings = { autoUpdate: true, author: "", recent: ["/Users/sample/Documents/見積書_2025.pdf"], seenTips: [] };
/** The stamp library, for this run only. */
const stamps = new Map<string, Stamp & { img: ImageInfo }>();

/** Drafts, kept across reloads (sessionStorage) so recovery can be tried. */
function loadDrafts(): Record<string, { path: string; savedAt: number; json: string }> {
  try {
    return JSON.parse(sessionStorage.getItem("mock.drafts") ?? "{}");
  } catch {
    return {};
  }
}
function saveDrafts(d: Record<string, { path: string; savedAt: number; json: string }>) {
  sessionStorage.setItem("mock.drafts", JSON.stringify(d));
}
let nextId = 1;
const views = new Map<number, Uint8Array>();
const images = new Map<number, { bytes: Uint8Array; width: number; height: number }>();
let nextImage = 1;

/**
 * Page sizes in turn: Letter, A4, A4 landscape, a scan a little off A4.
 * Real files mix sizes, and the viewer has to scroll through them smoothly.
 */
const SIZES = ["0 0 612 792", "0 0 595 842", "0 0 842 595", "0 0 598 845"];

/** A small PDF made by hand: `pages` pages of Helvetica text, a link, a form. */
function samplePdf(pages: number): Uint8Array {
  const objects: string[] = [];
  const add = (s: string) => objects.push(s) - 1 + 1;
  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  // Japanese in a font that isn't embedded: pdf.js needs its CMaps for it.
  const desc = add(
    "<< /Type /FontDescriptor /FontName /KozMinPr6N-Regular /Flags 6 /FontBBox [-437 -340 1147 1317] /ItalicAngle 0 /Ascent 1317 /Descent -349 /CapHeight 742 /StemV 80 >>",
  );
  const cid = add(
    `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPr6N-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> /FontDescriptor ${desc} 0 R /DW 1000 >>`,
  );
  const jp = add(`<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPr6N-Regular /Encoding /UniJIS-UCS2-H /DescendantFonts [${cid} 0 R] >>`);
  const utf16 = (t: string) => Array.from(t, (c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("");
  const kids: number[] = [];
  const fields: number[] = [];
  for (let i = 0; i < pages; i++) {
    const lines = [
      `BT /F1 28 Tf 72 740 Td (Sample document - page ${i + 1}) Tj ET`,
      `BT /F2 14 Tf 72 712 Td <${utf16(`御見積書（第${i + 1}頁）株式会社サンプル`)}> Tj ET`,
      ...Array.from({ length: 22 }, (_, k) => `BT /F1 12 Tf 72 ${690 - k * 22} Td (Line ${k + 1}: The quick brown fox jumps over the lazy dog. Estimate 2025-${i + 1}.) Tj ET`),
      "0 0 1 rg BT /F1 12 Tf 72 150 Td (Go to the last page) Tj ET",
      "0 g BT /F1 12 Tf 72 110 Td (Name:) Tj ET",
      "BT /F1 12 Tf 330 110 Td (Agree) Tj ET",
    ].join("\n");
    const content = add(`<< /Length ${lines.length} >>\nstream\n${lines}\nendstream`);
    const page = add("");
    const link = add(`<< /Type /Annot /Subtype /Link /Rect [70 145 200 165] /Border [0 0 0] /Dest [${0} 0 R /Fit] >>`);
    const annots = [link];
    if (i === 0) {
      const text = add(
        `<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /Rect [120 104 300 124] /F 4 /P ${page} 0 R /DA (/Helv 11 Tf 0 g) /MK << /BC [0.5 0.5 0.5] >> >>`,
      );
      const box = add(
        `<< /Type /Annot /Subtype /Widget /FT /Btn /T (agree) /Rect [310 106 324 120] /F 4 /P ${page} 0 R /AS /Off /MK << /BC [0 0 0] /CA (4) >> /DA (/ZaDb 0 Tf 0 g) /AP << /N << /Yes ${objects.length + 2} 0 R /Off ${objects.length + 3} 0 R >> >> >>`,
      );
      add("<< /Type /XObject /Subtype /Form /BBox [0 0 14 14] /Length 33 >>\nstream\n0 g 2 2 10 10 re f 0 G 0 0 14 14 re S\nendstream");
      add("<< /Type /XObject /Subtype /Form /BBox [0 0 14 14] /Length 15 >>\nstream\n0 0 14 14 re S\nendstream");
      annots.push(text, box);
      fields.push(text, box);
    }
    objects[page - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [${SIZES[i % SIZES.length]}] /Resources << /Font << /F1 ${font} 0 R /F2 ${jp} 0 R /Helv ${font} 0 R >> >> /Contents ${content} 0 R /Annots [${annots.map((a) => `${a} 0 R`).join(" ")}] >>`;
    kids.push(page);
  }
  // Links go to the last page.
  for (let i = 0; i < objects.length; i++) objects[i] = objects[i].replace("/Dest [0 0 R", `/Dest [${kids[kids.length - 1]} 0 R`);
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  objects[catalog - 1] =
    `<< /Type /Catalog /Pages ${pagesId} 0 R /AcroForm << /Fields [${fields.map((f) => `${f} 0 R`).join(" ")}] /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${font} 0 R >> >> >> >>`;
  let out = "%PDF-1.7\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

async function imageInfo(bytes: Uint8Array): Promise<ImageInfo> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  const id = nextImage++;
  images.set(id, { bytes, width: bmp.width, height: bmp.height });
  return { id, width: bmp.width, height: bmp.height };
}

const none = () => Promise.resolve();

const backend: Backend = {
  getAppSettings: async () => settings,
  setAppSettings: async (s) => (settings = s),
  osUserName: async () => "sample",
  textFontFamily: async () => null,
  systemProxy: async () => null,
  takeOpenRequests: async () => [],
  revealLog: none,
  openReleasePage: none,
  revealBackups: none,
  revealFile: none,

  async openPdf(path) {
    const id = nextId++;
    views.set(id, samplePdf(path.includes("見積") ? 3 : 12));
    settings.recent = [path, ...settings.recent.filter((p) => p !== path)].slice(0, 12);
    const opened: OpenedPdf = {
      id,
      path,
      name: path.split("/").pop() ?? path,
      size: views.get(id)!.length,
      readOnly: null,
      signed: false,
      annots: [],
    };
    return opened;
  },
  async pdfViewBytes(id) {
    const v = views.get(id);
    if (!v) throw "PDF がもう閉じられています";
    views.delete(id);
    return v;
  },
  async textLines(_id, index) {
    // The lines samplePdf draws, as Rust would list them (the Japanese one is in a font that can't be fixed).
    const page = index + 1;
    const make = (ops: number, text: string, size: number, y: number, editable: boolean, why = "") => ({
      ops: [ops],
      text,
      rect: [72, y - 0.22 * size, 72 + text.length * size * 0.5, y + 0.88 * size] as [number, number, number, number],
      size,
      color: "#000000",
      font: editable ? "Helvetica" : "KozMinPr6N-Regular",
      chars: editable ? " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz" : null,
      editable,
      why,
    });
    return [
      make(1, `Sample document - page ${page}`, 28, 740, true),
      make(2, `御見積書（第${page}頁）株式会社サンプル`, 14, 712, false, "このフォントの文字は直せません（文字コードの表が特殊です）"),
      ...Array.from({ length: 22 }, (_, k) =>
        make(3 + k, `Line ${k + 1}: The quick brown fox jumps over the lazy dog. Estimate 2025-${page}.`, 12, 690 - k * 22, true),
      ),
    ];
  },
  closePdf: none,
  async savePdf(request) {
    console.info("save_pdf (mock)", request);
    return { path: request.path, size: 12345, backup: null };
  },
  // The sample again, as many pages as asked for (no annotations drawn).
  composePdf: async (request) => samplePdf(Math.max(1, request.pages.length)),

  addImage: () => Promise.reject("ブラウザ版ではファイルを読めません。画像は貼り付けてください"),
  addImageBytes: (data) => imageInfo(data),
  async imageBytes(id) {
    const img = images.get(id);
    if (!img) throw "画像が見つかりません";
    return img.bytes;
  },
  listStamps: async () => [...stamps.values()].map(({ id, name }) => ({ id, name })),
  addStamp: () => Promise.reject("ブラウザ版ではファイルを読めません"),
  async addStampBytes(data) {
    const img = await imageInfo(data);
    const id = `${String(stamps.size + 1).padStart(4, "0")}_署名.png`;
    stamps.set(id, { id, name: "署名", img });
    return { id, name: "署名" };
  },
  async removeStamp(id) {
    stamps.delete(id);
  },
  async useStamp(id) {
    const s = stamps.get(id);
    if (!s) throw "スタンプが見つかりません";
    return s.img;
  },

  async writeDraft({ path, json }) {
    const d = loadDrafts();
    const id = Array.from(path).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16);
    d[id] = { path, savedAt: Date.now(), json };
    saveDrafts(d);
    return id;
  },
  async listDrafts() {
    return Object.entries(loadDrafts()).map(([id, d]): Draft => ({ id, ...d, images: [] }));
  },
  async removeDraft(id) {
    const d = loadDrafts();
    delete d[id];
    saveDrafts(d);
  },
};

const dialogs: Dialogs = {
  openFiles: async () => ["/Users/sample/Documents/サンプル資料.pdf"],
  openFolder: async () => "/Users/sample/Documents",
  saveAs: async ({ defaultPath }) => defaultPath ?? "/Users/sample/Documents/out.pdf",
  ...promptDialogs,
};

export const mockHost: Host = { kind: "web", backend, dialogs, can: webCan };
