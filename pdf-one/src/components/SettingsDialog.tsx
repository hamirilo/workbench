import { useCallback, useEffect, useState } from "react";
import { host } from "../host";
import { api, type AppSettings } from "../lib/api";
import { useStore } from "../store";
import { Row, Section, SettingsFrame, type SettingsGroup } from "./SettingsFrame";
import { UpdateSection } from "./UpdateSection";

const TEXT_SIZES: [number, string][] = [
  [1, "ふつう"],
  [1.15, "大きく"],
  [1.3, "もっと大きく"],
];

const GROUPS: SettingsGroup<"general">[] = [{ pages: [{ id: "general", label: "一般" }] }];

/** ⌘, (Platform UI §9): one dialog for all settings, in the frame every tool shares. */
export function SettingsDialog() {
  // The function itself, not one made in the selector: a new function on
  // every read makes zustand re-render without end.
  const openDialog = useStore((s) => s.openDialog);
  const close = useCallback(() => openDialog(null), [openDialog]);
  const toast = useStore((s) => s.toast);
  const setAuthor = useStore((s) => s.setAuthor);
  const textSize = useStore((s) => s.textSize);
  const setTextSize = useStore((s) => s.setTextSize);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [osName, setOsName] = useState("");
  const [font, setFont] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api.getAppSettings().then(setSettings, (e) => toast(`設定を読み込めませんでした: ${e}`, true));
    api.osUserName().then(setOsName, () => {});
    api.textFontFamily().then(setFont, () => setFont(null));
  }, [toast]);

  const change = (next: AppSettings) => {
    setSettings(next);
    setAuthor(next.author.trim() || osName);
    api.setAppSettings(next).catch((e) => toast(String(e), true));
  };

  return (
    <SettingsFrame groups={GROUPS} page="general" onPage={() => {}} onClose={close}>
      <Section title="表示">
        <Row label="画面の文字の大きさ" hint="ボタンや一覧の文字が大きくなります。PDF の中身の大きさは、右下の「表示の大きさ」で変えます">
          <div className="flex gap-0.5 rounded-md border border-line p-0.5" role="radiogroup" aria-label="画面の文字の大きさ">
            {TEXT_SIZES.map(([n, label]) => (
              <button
                key={n}
                role="radio"
                aria-checked={textSize === n}
                onClick={() => setTextSize(n)}
                className={`h-6 rounded px-2 text-xs whitespace-nowrap ${textSize === n ? "bg-accent text-white" : "hover:bg-hover"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="書き込み">
        <Row
          label="書き込みに記録する名前"
          hint="付箋やマーカーに記録され、Acrobat などでも表示されます。空欄ならパソコンのユーザー名です"
          disabled={!settings}
        >
          <input
            value={settings?.author ?? ""}
            disabled={!settings}
            placeholder={osName || "名前"}
            aria-label="書き込みに記録する名前"
            onChange={(e) => settings && change({ ...settings, author: e.target.value })}
            className="h-7 w-44 rounded border border-line bg-bg px-2 text-[13px] outline-none focus:border-accent"
          />
        </Row>
        <Row
          label="書き込む文字のフォント"
          hint={
            font === undefined
              ? "確認中…"
              : font
                ? `${font}（パソコンのフォントを PDF に埋め込みます）`
                : "日本語のフォントが見つかりません。日本語は保存できません"
          }
        />
      </Section>

      {host().can.updates && (
        <UpdateSection
          autoUpdate={settings?.autoUpdate}
          onAutoUpdate={(autoUpdate) => settings && change({ ...settings, autoUpdate })}
        />
      )}
    </SettingsFrame>
  );
}
