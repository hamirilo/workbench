import { useCallback, useEffect, useState } from "react";
import { api, type AppSettings } from "../lib/api";
import { useStore } from "../store";
import { SettingsFrame, type SettingsGroup } from "./SettingsFrame";
import { UpdateSection } from "./UpdateSection";

const GROUPS: SettingsGroup<"general">[] = [{ pages: [{ id: "general", label: "一般" }] }];

/** ⌘, (Platform UI §9): one dialog for all settings, in the frame every tool shares. */
export function SettingsDialog() {
  // The function itself, not one made in the selector: a new function on
  // every read makes zustand re-render without end.
  const openDialog = useStore((s) => s.openDialog);
  const close = useCallback(() => openDialog(null), [openDialog]);
  const toast = useStore((s) => s.toast);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    api.getAppSettings().then(setSettings, (e) => toast(`設定を読み込めませんでした: ${e}`, true));
  }, [toast]);

  const change = (next: AppSettings) => {
    setSettings(next);
    api.setAppSettings(next).catch((e) => toast(String(e), true));
  };

  return (
    <SettingsFrame groups={GROUPS} page="general" onPage={() => {}} onClose={close}>
      <UpdateSection
        autoUpdate={settings?.autoUpdate}
        onAutoUpdate={(autoUpdate) => settings && change({ ...settings, autoUpdate })}
      />
    </SettingsFrame>
  );
}
