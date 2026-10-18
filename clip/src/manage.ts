import { listen } from "@tauri-apps/api/event";
import { api, el, isMac, oneLine, Settings, shortcutLabel, Snippet, Status, UpdateState } from "./shared";

/** Offered as one-click additions; each becomes a snippet with that name. */
const PRESETS = [
  "メールアドレス",
  "電話番号",
  "携帯電話",
  "FAX",
  "郵便番号",
  "住所",
  "会社名",
  "部署名",
  "氏名",
  "氏名（ふりがな）",
  "メールの署名",
];

/** Same as `store::SHORTCUTS` (the first is the default), with what each can clash with. */
const SHORTCUTS: [string, string][] = [
  ["Ctrl+Alt+C", ""],
  ["Ctrl+Alt+V", isMac ? "" : "Excel などの「形式を選択して貼り付け」と重なります"],
  ["Ctrl+Shift+Space", ""],
  ["Ctrl+Alt+Space", isMac ? "入力ソースの切り替えと重なることがあります" : ""],
];
const LIMITS = [50, 100, 200, 500];
const DAYS = [1, 7, 30, 90, 365];
const SAVE_DELAY = 400;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const listEl = $<HTMLUListElement>("snippet-list");
const formEl = $<HTMLFormElement>("editor-form");
const editorEmptyEl = $("editor-empty");
const labelEl = $<HTMLInputElement>("label");
const textEl = $<HTMLTextAreaElement>("text");
const savedEl = $("saved");
const deleteBtn = $<HTMLButtonElement>("delete");
const presetsEl = $("presets");

let snippets: Snippet[] = [];
let selectedId: number | null = null;
let saveTimer: number | undefined;
let deleteArmed: number | undefined;
let status: Status | null = null;
let settings: Settings | null = null;
let update: UpdateState = { state: "idle" };

// ---------------------------------------------------------------------------
// Tabs

function showTab(name: string) {
  for (const tab of document.querySelectorAll<HTMLElement>(".tab")) {
    tab.classList.toggle("active", tab.dataset.tab === name);
  }
  $("tab-snippets").hidden = name !== "snippets";
  $("tab-settings").hidden = name !== "settings";
}

for (const tab of document.querySelectorAll<HTMLElement>(".tab")) {
  tab.addEventListener("click", () => showTab(tab.dataset.tab ?? "snippets"));
}

// ---------------------------------------------------------------------------
// Snippets

async function loadSnippets() {
  try {
    snippets = (await api.entries()).snippets;
  } catch (e) {
    console.error("entries", e);
  }
  if (selectedId !== null && !snippets.some((s) => s.id === selectedId)) selectedId = null;
  renderList();
  renderPresets();
  // Changes made elsewhere (a history entry turned into a snippet) show up
  // here, without overwriting what is being typed.
  if (saveTimer === undefined) fillEditor();
}

function renderList() {
  listEl.replaceChildren(
    ...snippets.map((s) => {
      const li = el("li", s.id === selectedId ? "selected" : undefined);
      li.append(el("span", "item-label", s.label || "（名前なし）"));
      li.append(el("span", s.text ? "item-text" : "item-text empty-text", s.text ? oneLine(s.text) : "（内容が空です）"));
      li.addEventListener("click", () => select(s.id));
      return li;
    }),
  );
  if (snippets.length === 0) listEl.append(el("li", "list-empty", "まだありません"));
}

function renderPresets() {
  const used = new Set(snippets.map((s) => s.label));
  presetsEl.replaceChildren(
    ...PRESETS.filter((p) => !used.has(p)).map((preset) => {
      const chip = el("button", "chip", `＋ ${preset}`);
      chip.type = "button";
      chip.addEventListener("click", () => add(preset));
      return chip;
    }),
  );
}

/** Shows the selected snippet. Unless `force`d, leaves a field being typed in alone. */
function fillEditor(force = false) {
  const snippet = snippets.find((s) => s.id === selectedId);
  formEl.hidden = !snippet;
  editorEmptyEl.hidden = !!snippet;
  if (!snippet) return;
  if (force || document.activeElement !== labelEl) labelEl.value = snippet.label;
  if (force || document.activeElement !== textEl) textEl.value = snippet.text;
}

async function select(id: number) {
  await flush();
  selectedId = id;
  savedEl.textContent = "";
  disarmDelete();
  renderList();
  fillEditor(true);
}

async function add(label: string) {
  await flush();
  try {
    const snippet = await api.addSnippet(label, "");
    snippets.push(snippet);
    await select(snippet.id);
    // A preset already has its name; go straight to the content.
    (label ? textEl : labelEl).focus();
  } catch (e) {
    savedEl.textContent = String(e);
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  savedEl.textContent = "";
  saveTimer = window.setTimeout(flush, SAVE_DELAY);
}

/** Saves the editor right away if it has unsaved changes. */
async function flush() {
  if (saveTimer === undefined) return;
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  const snippet = snippets.find((s) => s.id === selectedId);
  if (!snippet) return;
  snippet.label = labelEl.value;
  snippet.text = textEl.value;
  try {
    await api.updateSnippet(snippet.id, snippet.label, snippet.text);
    savedEl.textContent = "保存しました";
  } catch (e) {
    savedEl.textContent = `保存できませんでした：${e}`;
  }
}

function disarmDelete() {
  window.clearTimeout(deleteArmed);
  deleteArmed = undefined;
  deleteBtn.textContent = "削除";
}

labelEl.addEventListener("input", scheduleSave);
textEl.addEventListener("input", scheduleSave);
labelEl.addEventListener("blur", flush);
textEl.addEventListener("blur", flush);
formEl.addEventListener("submit", (e) => e.preventDefault());

deleteBtn.addEventListener("click", async () => {
  if (selectedId === null) return;
  // Two presses, so one slip doesn't lose a snippet.
  if (deleteArmed === undefined) {
    deleteBtn.textContent = "もう一度押すと削除";
    deleteArmed = window.setTimeout(disarmDelete, 3000);
    return;
  }
  disarmDelete();
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  const id = selectedId;
  selectedId = null;
  try {
    await api.deleteSnippet(id);
  } catch (e) {
    savedEl.textContent = String(e);
  }
});

$("add").addEventListener("click", () => add(""));

async function moveSelected(by: number) {
  if (selectedId === null) return;
  await flush();
  try {
    await api.moveSnippet(selectedId, by);
  } catch (e) {
    console.error("move", e);
  }
}

$("up").addEventListener("click", () => moveSelected(-1));
$("down").addEventListener("click", () => moveSelected(1));

// ---------------------------------------------------------------------------
// Settings

function fillSelect(select: HTMLSelectElement, options: [string, string][]) {
  select.replaceChildren(
    ...options.map(([value, label]) => {
      const option = el("option", undefined, label);
      option.value = value;
      return option;
    }),
  );
}

/** A few to choose from: one radio row each, with what it can clash with. */
$("shortcuts").replaceChildren(
  ...SHORTCUTS.map(([value, note]) => {
    const row = el("label", "s-row clickable");
    const radio = el("input");
    radio.type = "radio";
    radio.name = "shortcut";
    radio.value = value;
    radio.addEventListener("change", () => saveSettings({ shortcut: value }));
    const text = el("span", "s-text");
    text.append(el("span", "s-label", shortcutLabel(value)));
    if (note) text.append(el("span", "s-hint", note));
    row.append(radio, text);
    return row;
  }),
);
fillSelect(
  $("limit"),
  LIMITS.map((n) => [String(n), `${n} 件`]),
);
fillSelect(
  $("days"),
  DAYS.map((n) => [String(n), n === 365 ? "1 年" : `${n} 日`]),
);

function setSwitch(id: string, on: boolean) {
  $(id).setAttribute("aria-checked", String(on));
}

async function loadSettings() {
  try {
    settings = await api.settings();
    status = await api.status();
  } catch (e) {
    console.error("settings", e);
    return;
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="shortcut"]')) {
    radio.checked = radio.value === settings.shortcut;
  }
  setSwitch("record", settings.recordHistory);
  setSwitch("auto-update", settings.autoUpdate);
  $<HTMLSelectElement>("limit").value = String(settings.historyLimit);
  $<HTMLSelectElement>("days").value = String(settings.historyDays);

  const label = shortcutLabel(status.shortcut);
  $("open-hint").textContent = status.shortcutActive ? `呼び出し：${label}` : "";
  for (const span of document.querySelectorAll(".shortcut-text")) span.textContent = label;
  const warning = $("shortcut-warning");
  warning.hidden = status.shortcutActive;
  warning.textContent = `${label} はほかのアプリが使っているため、いまは使えません。別のものを選んでください。トレイのメニューの「Clip を開く」からも開けます。`;

  // Only macOS asks for a permission before Clip may type into other apps.
  $("accessibility").hidden = !isMac;
  $("accessibility-status").textContent = status.autoPaste
    ? "許可されています。選んだものを、それまで使っていたアプリにそのまま入力します。"
    : "許可されていません。いまは選ぶとコピーだけされるので、⌘V で貼り付けてください。アップデートのあとで動かなくなったときは、システム設定のアクセシビリティで Clip を一度「−」で外してから、もう一度許可してください。";
  $("allow").hidden = status.autoPaste;
  $("version").textContent = `v${status.version}`;
}

async function saveSettings(change: Partial<Settings>) {
  if (!settings) return;
  const error = $("settings-error");
  try {
    settings = await api.setSettings({ ...settings, ...change });
    error.hidden = true;
  } catch (e) {
    error.textContent = String(e);
    error.hidden = false;
  }
  await loadSettings();
}

$("record").addEventListener("click", () => saveSettings({ recordHistory: !settings?.recordHistory }));
$("auto-update").addEventListener("click", () => saveSettings({ autoUpdate: !settings?.autoUpdate }));
$("limit").addEventListener("change", (e) =>
  saveSettings({ historyLimit: Number((e.target as HTMLSelectElement).value) }),
);
$("days").addEventListener("change", (e) => saveSettings({ historyDays: Number((e.target as HTMLSelectElement).value) }));
$("clear-history").addEventListener("click", () => api.askClearHistory());
$("allow").addEventListener("click", () => api.requestAccessibility());

// ---------------------------------------------------------------------------
// Update (desktop-platform UI §9.1). While this window is open, the checks'
// results come here instead of a dialog.

function renderUpdate() {
  const statusEl = $("update-status");
  statusEl.className = "s-hint";
  statusEl.title = "";
  switch (update.state) {
    case "checking":
      statusEl.textContent = "確認しています…";
      break;
    case "latest":
      statusEl.textContent = "最新版です";
      statusEl.classList.add("good");
      break;
    case "available":
      statusEl.textContent = `v${update.version} が使えます`;
      statusEl.classList.add("good");
      break;
    case "installing":
      statusEl.textContent =
        update.percent === null ? "アップデートを準備しています…" : `ダウンロードしています… ${update.percent}%`;
      break;
    case "error":
      statusEl.textContent = "確認できませんでした。ネットワークを確かめて、もう一度お試しください";
      statusEl.title = update.message;
      statusEl.classList.add("bad");
      break;
    case "failed":
      statusEl.textContent = `v${update.version} に更新できませんでした。もう一度お試しください`;
      statusEl.title = update.message;
      statusEl.classList.add("bad");
      break;
    default:
      statusEl.textContent = "";
  }
  const available = update.state === "available" || update.state === "failed";
  $("release-notes").hidden = !available;
  $("install-update").hidden = !available;
  $("check-update").hidden = available;
  $<HTMLButtonElement>("check-update").disabled = update.state === "checking" || update.state === "installing";
  $("update-dot").hidden = !available;
}

$("check-update").addEventListener("click", () => api.checkUpdate());
$("install-update").addEventListener("click", () => api.installUpdate());
$("release-notes").addEventListener("click", () => {
  if (update.state === "available" || update.state === "failed") api.openReleasePage(update.version);
});
$("this-release").addEventListener("click", () => api.openReleasePage());

listen<UpdateState>("update-state", (e) => {
  update = e.payload;
  renderUpdate();
});
// "アップデートを確認…" in the tray menu while this window is open.
listen("show-update", () => {
  showTab("settings");
  $("update").scrollIntoView({ block: "nearest" });
});
api.updateState().then((state) => {
  update = state;
  renderUpdate();
});

// ---------------------------------------------------------------------------

listen("entries-changed", () => {
  loadSnippets();
  loadSettings();
});
// Coming back from System Settings: the permission may have changed.
window.addEventListener("focus", loadSettings);

showTab("snippets");
loadSnippets();
loadSettings();
