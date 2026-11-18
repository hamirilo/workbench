/**
 * Every operation of the app, defined once (Platform Architecture §3). The
 * menu bar, the key handling and the shortcut list are made from this table,
 * so a name and its key read the same everywhere. Add an operation here
 * first, never straight into a menu or a key handler.
 */
import { FileText, FolderOpen, PanelLeft, RotateCw, X, type LucideIcon } from "lucide-react";
import { chooseFile, closeDoc, copyPath, reload, revealDoc, revealLabel, zoom } from "./actions";
import { api } from "./api";
import { comboMatches, fromField } from "./keys";
import { checkForUpdate, openReleaseNotes } from "./update";
import { useStore, ZOOMS, type S } from "../store";

export interface Command {
  id: string;
  /** Name in the shortcut list and the default label. */
  title: string;
  /** The label for the current state. */
  label?: (s: S) => string;
  icon?: LucideIcon;
  /** The first is the one menus show; ⌘ / Ctrl combos become the menu's accelerator. */
  keys?: string[];
  enabled?: (s: S) => boolean;
  checked?: (s: S) => boolean;
  run: (s: S) => void;
  /** Who handles the key: the page's handler (default), or only the menu bar's accelerator. */
  keyBy?: "page" | "menu";
}

const shown = (s: S) => s.doc !== null;

export const COMMANDS: Command[] = [
  {
    id: "file.open",
    title: "開く…",
    icon: FolderOpen,
    keys: ["Mod+O"],
    run: () => void chooseFile(),
  },
  {
    id: "file.reload",
    title: "読み込み直す",
    icon: RotateCw,
    keys: ["Mod+R"],
    enabled: shown,
    run: () => void reload(),
  },
  {
    id: "file.close",
    title: "閉じる",
    icon: X,
    keys: ["Mod+W"],
    enabled: shown,
    run: () => void closeDoc(),
  },
  {
    id: "file.reveal",
    title: revealLabel,
    icon: FileText,
    keys: ["Mod+Shift+R"],
    enabled: shown,
    run: () => void revealDoc(),
  },
  {
    id: "file.copyPath",
    title: "パスをコピー",
    keys: ["Mod+Shift+C"],
    enabled: shown,
    run: () => void copyPath(),
  },
  {
    id: "view.outline",
    title: "目次",
    icon: PanelLeft,
    keys: ["Mod+Shift+O"],
    enabled: shown,
    checked: (s) => s.outline,
    run: (s) => s.toggleOutline(),
  },
  {
    id: "view.zoomIn",
    title: "文字を大きく",
    keys: ["Mod+=", "Mod+Plus", "Mod+;"],
    enabled: (s) => s.zoom < ZOOMS[ZOOMS.length - 1],
    run: () => zoom(1),
  },
  {
    id: "view.zoomOut",
    title: "文字を小さく",
    keys: ["Mod+-"],
    enabled: (s) => s.zoom > ZOOMS[0],
    run: () => zoom(-1),
  },
  {
    id: "view.zoomReset",
    title: "文字を標準の大きさに",
    keys: ["Mod+0"],
    enabled: (s) => s.zoom !== 1,
    run: () => zoom(0),
  },
  {
    id: "go.top",
    title: "先頭へ",
    keys: ["Home"],
    enabled: shown,
    run: () => document.querySelector("[data-article]")?.scrollTo({ top: 0 }),
  },
  {
    id: "go.bottom",
    title: "末尾へ",
    keys: ["End"],
    enabled: shown,
    run: () => {
      const el = document.querySelector("[data-article]");
      el?.scrollTo({ top: el.scrollHeight });
    },
  },
  { id: "app.settings", title: "設定…", keys: ["Mod+,"], run: (s) => s.openDialog("settings") },
  { id: "app.checkUpdate", title: "アップデートを確認…", run: () => void checkForUpdate(true) },
  { id: "help.releaseNotes", title: "このバージョンの更新内容", run: () => openReleaseNotes() },
  // Windows' ヘルプ menu (macOS has the system's about panel in the app menu):
  // the settings' アップデート section shows the app, its version and updates.
  { id: "help.about", title: "Markdown Viewer について", run: (s) => s.openDialog("settings") },
  { id: "help.shortcuts", title: "キーボードショートカット", keys: ["?"], run: (s) => s.openDialog("shortcuts") },
  {
    id: "help.log",
    title: "ログを表示",
    run: (s) => void api.revealLog().catch((e) => s.toast(`ログを開けませんでした: ${e}`, true)),
  },
];

const byId = new Map(COMMANDS.map((c) => [c.id, c]));

export function command(id: string): Command {
  const c = byId.get(id);
  if (!c) throw new Error(`unknown command ${id}`);
  return c;
}

export const isEnabled = (c: Command, s: S) => c.enabled?.(s) ?? true;

export const labelOf = (c: Command, s: S) => c.label?.(s) ?? c.title;

/**
 * The last command run and from where. A key can reach both the menu bar's
 * accelerator and the page's handler (which one depends on the platform),
 * so the second of the two within a moment is dropped.
 */
let lastRun = { id: "", by: "", at: 0 };

function runFrom(c: Command, s: S, by: "key" | "menu") {
  const now = performance.now();
  if (lastRun.id === c.id && lastRun.by !== by && now - lastRun.at < 250) return;
  lastRun = { id: c.id, by, at: now };
  c.run(s);
}

/** Runs a command by id if it is enabled now (menu bar items). */
export function runCommand(id: string) {
  const c = command(id);
  const s = useStore.getState();
  if (isEnabled(c, s)) runFrom(c, s, "menu");
}

/**
 * The page's key handler: runs the command bound to `e`. Keys stop while a
 * dialog is open (it handles its own) and stay in text fields. A key whose
 * command is off now is left alone (Enter on a focused button still clicks it).
 */
export function runKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || fromField(e)) return false;
  const s = useStore.getState();
  if (s.dialog || document.querySelector("[data-modal]")) return false;
  for (const c of COMMANDS) {
    if (c.keyBy === "menu" || !c.keys?.some((k) => comboMatches(k, e))) continue;
    if (!isEnabled(c, s)) return false;
    e.preventDefault();
    runFrom(c, s, "key");
    return true;
  }
  return false;
}
