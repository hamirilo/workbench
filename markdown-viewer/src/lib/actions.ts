// Operations that go through Rust and then report back (commands.ts calls
// these; so do the start screen, the drop handler and the article's links).
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { api, MARKDOWN_EXTENSIONS } from "./api";
import { isMac } from "./keys";
import { warn } from "./log";
import { useStore, ZOOMS } from "../store";

const st = () => useStore.getState();

export const revealLabel = isMac ? "Finder で表示" : "エクスプローラーで表示";

/** Where the article was scrolled to, kept across a read-again after a save. */
let keepScroll: number | null = null;
export const takeKeptScroll = () => {
  const y = keepScroll;
  keepScroll = null;
  return y;
};

/** Reads `path` and shows it. A file that can't be read leaves the one on screen as it was. */
export async function openPath(path: string, again = false) {
  st().setLoading(path);
  try {
    const doc = await api.openDoc(path);
    if (again) keepScroll = document.querySelector("[data-article]")?.scrollTop ?? null;
    st().setDoc(doc);
    document.title = doc.name;
  } catch (e) {
    st().notify({ title: again ? "読み込み直せませんでした" : "開けませんでした", detail: String(e), kind: "error" });
  } finally {
    st().setLoading(null);
  }
}

/** ⌘O: a file from the OS dialog. */
export async function chooseFile() {
  try {
    const picked = await open({
      multiple: false,
      title: "Markdown のファイルを開く",
      filters: [
        { name: "Markdown", extensions: MARKDOWN_EXTENSIONS },
        { name: "すべてのファイル", extensions: ["*"] },
      ],
    });
    if (typeof picked === "string") await openPath(picked);
  } catch (e) {
    st().toast(String(e), true);
  }
}

/** ⌘R: the same file again (it is also read again by itself on every save). */
export async function reload() {
  const d = st().doc;
  if (d) await openPath(d.path, true);
}

/** Back to the start screen. */
export async function closeDoc() {
  st().setDoc(null);
  document.title = "Markdown Viewer";
  try {
    await api.closeDoc();
  } catch (e) {
    warn("close", e);
  }
}

export async function revealDoc() {
  try {
    await api.revealDoc();
  } catch (e) {
    st().toast(String(e), true);
  }
}

export async function copyPath() {
  const d = st().doc;
  if (!d) return;
  try {
    await navigator.clipboard.writeText(d.path);
    st().notify({ title: "パスをコピーしました", detail: d.path, kind: "success", duration: 2500 });
  } catch (e) {
    st().toast(`パスをコピーできませんでした: ${e}`, true);
  }
}

export function zoom(step: 1 | -1 | 0) {
  const i = ZOOMS.indexOf(st().zoom);
  const next = step === 0 ? 1 : ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + step))];
  st().setZoom(next);
}

/** Scrolls the article to heading `id` and marks it for a moment. */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el || !el.closest("[data-article]")) return;
  el.scrollIntoView({ block: "start", behavior: "smooth" });
  el.classList.remove("jumped");
  void el.offsetWidth; // restarts the animation
  el.classList.add("jumped");
}

/**
 * A click on a link in the article: `#見出し` scrolls, web and mail links go
 * to the browser, a Markdown file opens here, any other file is shown in
 * Finder / Explorer (never run).
 */
export async function followLink(href: string) {
  try {
    if (href.startsWith("#")) {
      jumpTo(decodeURIComponent(href.slice(1)));
    } else if (/^(https?:|mailto:)/i.test(href)) {
      await api.openUrl(href);
    } else {
      const path = await api.followLink(href);
      if (path) {
        await openPath(path);
        const hash = href.split("#")[1];
        if (hash) requestAnimationFrame(() => jumpTo(decodeURIComponent(hash)));
      }
    }
  } catch (e) {
    st().toast(String(e), true);
  }
}

/**
 * Files handed over by the OS: the one that launched the app, and ones opened
 * from Finder / Explorer while it runs. Saves of the file on screen read it
 * again. Returns a cleanup.
 */
export function listenForFiles(): () => void {
  const stops: Promise<() => void>[] = [
    listen<string>("open-file", (e) => {
      void api.takePendingFile().catch(() => null);
      void openPath(e.payload);
    }),
    listen<string>("doc-changed", (e) => {
      if (st().doc?.path === e.payload) void openPath(e.payload, true);
    }),
  ];
  api
    .takePendingFile()
    .then((path) => (path ? openPath(path) : undefined))
    .catch((e) => warn("pending file", e));
  return () => stops.forEach((p) => void p.then((stop) => stop()).catch(() => {}));
}
