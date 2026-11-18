import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { openPath } from "../lib/actions";
import { warn } from "../lib/log";
import { useStore } from "../store";

/**
 * A file dropped from Finder / Explorer is opened, through Tauri's drop
 * events (Platform UI §6: not HTML5 drag and drop). While something is
 * dragged over the window, the whole window says what a drop does.
 */
export function useFileDrop(): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let stop: (() => void) | undefined;
    let gone = false;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over") setOver(true);
        else if (p.type === "leave") setOver(false);
        else if (p.type === "drop") {
          setOver(false);
          if (p.paths.length !== 1) {
            useStore.getState().toast("ファイルを 1 つだけドロップしてください", true);
            return;
          }
          void openPath(p.paths[0]);
        }
      })
      .then((un) => (gone ? un() : (stop = un)))
      .catch((e) => warn("drop", e));
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
  return over;
}

export function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-accent/10 p-6">
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent text-accent">
        <FileText size={40} strokeWidth={1.5} />
        <div className="text-base">ドロップして開く</div>
        <div className="text-xs text-dim">Markdown のファイルを表示します</div>
      </div>
    </div>
  );
}
