import { useEffect, useRef } from "react";
import { jumpTo } from "../lib/actions";
import { useStore } from "../store";

/** The headings of the file, beside it (⌘⇧O). The one being read is marked. */
export function Outline() {
  const headings = useStore((s) => s.headings);
  const current = useStore((s) => s.current);
  const list = useRef<HTMLElement>(null);
  const top = Math.min(...headings.map((h) => h.level));

  // The marked heading stays in sight in a long outline.
  useEffect(() => {
    if (current) list.current?.querySelector(`[data-id="${CSS.escape(current)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <nav ref={list} aria-label="目次" className="w-60 shrink-0 overflow-y-auto border-r border-line bg-panel px-2 py-3">
      <div className="px-2 pb-2 text-xs text-dim">目次</div>
      {headings.length === 0 ? (
        <div className="px-2 text-xs text-dim">見出しがありません</div>
      ) : (
        headings.map((h) => (
          <button
            key={h.id}
            data-id={h.id}
            onClick={() => jumpTo(h.id)}
            title={h.text}
            style={{ paddingLeft: `${8 + (h.level - top) * 12}px` }}
            className={`block w-full truncate rounded py-1 pr-2 text-left text-[13px] hover:bg-hover ${
              h.id === current ? "bg-hover font-semibold text-accent" : h.level === top ? "text-fg" : "text-dim"
            }`}
          >
            {h.text || "（無題）"}
          </button>
        ))
      )}
    </nav>
  );
}
