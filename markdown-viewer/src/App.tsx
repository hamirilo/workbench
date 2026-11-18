import { useEffect } from "react";
import { DropOverlay, useFileDrop } from "./components/DropZone";
import { Outline } from "./components/Outline";
import { SettingsDialog } from "./components/SettingsDialog";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { StartScreen } from "./components/StartScreen";
import { StatusBar } from "./components/StatusBar";
import { Toasts } from "./components/Toasts";
import { Toolbar } from "./components/Toolbar";
import { Viewer } from "./components/Viewer";
import { listenForFiles } from "./lib/actions";
import { runKey } from "./lib/commands";
import { installMenuBar } from "./lib/menuBar";
import { loadAppVersion, scheduleUpdateCheck } from "./lib/update";
import { useStore } from "./store";

export default function App() {
  const dialog = useStore((s) => s.dialog);
  const shown = useStore((s) => s.doc !== null);
  const outline = useStore((s) => s.outline);
  const dropping = useFileDrop();

  useEffect(() => {
    void loadAppVersion();
    const stopMenu = installMenuBar();
    const stopUpdate = scheduleUpdateCheck();
    const stopFiles = listenForFiles();
    const onKey = (e: KeyboardEvent) => void runKey(e);
    window.addEventListener("keydown", onKey);
    return () => {
      stopMenu();
      stopUpdate();
      stopFiles();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      {shown ? (
        <div className="flex min-h-0 flex-1">
          {outline && <Outline />}
          <Viewer />
        </div>
      ) : (
        <StartScreen />
      )}
      <StatusBar />

      {dialog === "settings" && <SettingsDialog />}
      {dialog === "shortcuts" && <ShortcutHelp />}
      {dropping && <DropOverlay />}
      <Toasts />
    </div>
  );
}
