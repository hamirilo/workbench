// The one zustand store (Platform Architecture §5): the file on screen and
// how it is shown.
import { create } from "zustand";
import type { Doc } from "./lib/api";

export type ToastKind = "success" | "info" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  /** A second, quieter line (counts, reasons). */
  detail?: string;
  kind?: ToastKind;
  action?: ToastAction;
  /** ms before it goes away; paused while hovered or while the window is in the background. */
  duration?: number;
}

export interface Toast extends Required<Pick<ToastOptions, "title" | "kind" | "duration">> {
  id: number;
  detail?: string;
  action?: ToastAction;
  leaving?: boolean;
}

/** Downloading an update (src/lib/update.ts). */
export interface Updating {
  done: number;
  total: number | null;
  installing?: boolean;
}

/** Dialogs over the window; while one is open the page's keys stop (`data-modal`). */
export type Dialog = "settings" | "shortcuts" | null;

/** A heading of the file on screen, for the outline (read from the rendered page). */
export interface Heading {
  id: string;
  level: number;
  text: string;
}

/** The article's font size steps (⌘+ / ⌘- / ⌘0). */
export const ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];

interface State {
  toasts: Toast[];
  updating: Updating | null;
  dialog: Dialog;

  /** The file on screen; null on the start screen. */
  doc: Doc | null;
  /** A file being read (opened, or read again after a save). */
  loading: string | null;
  headings: Heading[];
  /** The heading at the top of the article, marked in the outline. */
  current: string | null;
  outline: boolean;
  zoom: number;
  /** Show the file's Markdown text as written, not the rendered page. */
  raw: boolean;
  theme: Theme;
  /** The OS is in dark mode now (follows changes). */
  osDark: boolean;

  setDoc: (doc: Doc | null) => void;
  toggleRaw: () => void;
  setTheme: (t: Theme) => void;
  setLoading: (path: string | null) => void;
  setHeadings: (h: Heading[]) => void;
  setCurrent: (id: string | null) => void;
  toggleOutline: () => void;
  setZoom: (z: number) => void;

  setUpdating: (u: Updating | null) => void;
  openDialog: (d: Dialog) => void;
  toast: (message: string, error?: boolean, action?: ToastAction) => void;
  notify: (t: ToastOptions) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

// localStorage can throw (private mode etc.); these are only preferences.
const load = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const persist = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

const savedZoom = Number(load("zoom"));

/** Light / dark: "auto" follows the OS (ADR-0001); the other two are chosen in the toolbar. */
export type Theme = "auto" | "light" | "dark";
const savedTheme = load("theme");
const initialTheme: Theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "auto";

const osDarkQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

/** The attribute the stylesheet reads (src/index.css); none means the OS decides. */
const applyTheme = (t: Theme) => {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
};
applyTheme(initialTheme);

/** Whether dark is on now, whatever chose it. */
export const isDark = (s: Pick<State, "theme" | "osDark">) => s.theme === "dark" || (s.theme === "auto" && s.osDark);

export const useStore = create<State>()((set, get) => ({
  toasts: [],
  updating: null,
  dialog: null,

  doc: null,
  loading: null,
  headings: [],
  current: null,
  outline: load("outline") !== "off",
  zoom: ZOOMS.includes(savedZoom) ? savedZoom : 1,
  raw: load("raw") === "on",
  theme: initialTheme,
  osDark: osDarkQuery?.matches ?? false,

  setDoc: (doc) => set(doc ? { doc } : { doc, headings: [], current: null }),
  setLoading: (loading) => set({ loading }),
  setHeadings: (headings) => set({ headings }),
  setCurrent: (current) => {
    if (get().current !== current) set({ current });
  },
  toggleOutline: () => {
    const outline = !get().outline;
    set({ outline });
    persist("outline", outline ? "on" : "off");
  },
  setZoom: (zoom) => {
    set({ zoom });
    persist("zoom", String(zoom));
  },
  toggleRaw: () => {
    const raw = !get().raw;
    set({ raw });
    persist("raw", raw ? "on" : "off");
  },
  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    persist("theme", theme);
  },

  setUpdating: (updating) => set({ updating }),
  openDialog: (dialog) => set({ dialog }),
  toast: (message, error, action) => get().notify({ title: message, kind: error ? "error" : "info", action }),
  notify: ({ title, detail, kind = "info", action, duration }) => {
    const id = ++toastSeq;
    const t: Toast = { id, title, detail, kind, action, duration: duration ?? (kind === "error" || action ? 8000 : 5000) };
    // At most three on screen (Platform UI §5); the oldest give way.
    const live = get().toasts.filter((x) => !x.leaving);
    for (const old of live.slice(0, Math.max(0, live.length - 2))) get().dismissToast(old.id);
    set({ toasts: [...get().toasts, t] });
  },
  dismissToast: (id) => {
    if (!get().toasts.some((t) => t.id === id && !t.leaving)) return;
    // Marked first so the exit animation can play, then removed.
    set({ toasts: get().toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 200);
  },
}));

osDarkQuery?.addEventListener("change", (e) => useStore.setState({ osDark: e.matches }));

export type S = State;
