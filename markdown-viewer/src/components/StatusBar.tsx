import { RefreshCw } from "lucide-react";
import { bytes } from "../lib/format";
import { useStore } from "../store";

const time = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" });

/** The bottom line: where the file is, when it was saved, and how it is read. */
export function StatusBar() {
  const doc = useStore((s) => s.doc);
  const zoom = useStore((s) => s.zoom);
  if (!doc) return null;
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-xs text-dim">
      <span className="min-w-0 flex-1 truncate" title={doc.path}>
        {doc.path}
      </span>
      {doc.encoding !== "UTF-8" && (
        <span className="shrink-0" title="UTF-8 ではないため、Shift_JIS として読みました">
          {doc.encoding}
        </span>
      )}
      <span className="shrink-0 tabular-nums">{bytes(doc.size)}</span>
      {doc.modified > 0 && <span className="shrink-0 tabular-nums">保存 {time.format(doc.modified)}</span>}
      {zoom !== 1 && <span className="shrink-0 tabular-nums">{Math.round(zoom * 100)}%</span>}
      <span className="flex shrink-0 items-center gap-1" title="ほかのアプリでこのファイルを保存すると、自動で読み込み直します">
        <RefreshCw size={12} />
        自動更新
      </span>
    </footer>
  );
}
