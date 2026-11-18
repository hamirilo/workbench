import { useEffect, useLayoutEffect, useRef } from "react";
import { followLink, takeKeptScroll } from "../lib/actions";
import { api } from "../lib/api";
import { highlightCode } from "../lib/highlight";
import { useStore, type Heading } from "../store";

/** The article's font size at 100%; the zoom multiplies it. */
const BASE_FONT = 15;

/**
 * Pictures are fetched through Rust (only next to the file, checked by their
 * bytes) and shown as data: URLs, so the page never loads a file by itself.
 * The address is moved aside before the HTML is put in the page.
 */
const holdImages = (html: string) => html.replace(/<img src="/g, '<img data-src="');

function missing(img: HTMLImageElement, why: string) {
  const box = document.createElement("span");
  box.className = "img-missing";
  box.textContent = img.alt ? `画像: ${img.alt}` : "画像";
  box.title = why;
  img.replaceWith(box);
}

function loadImages(root: HTMLElement) {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[data-src]")) {
    const src = img.dataset.src ?? "";
    if (/^https?:/i.test(src)) {
      // The app doesn't go out to the web for what a file points at (Platform Security §6).
      missing(img, `Web 上の画像は表示しません: ${src}`);
      continue;
    }
    api.readImage(src).then(
      (url) => (img.src = url),
      (e) => missing(img, String(e)),
    );
  }
}

const headingsOf = (root: HTMLElement): Heading[] =>
  [...root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")].map((h) => ({
    id: h.id,
    level: Number(h.tagName[1]),
    text: h.textContent?.trim() ?? "",
  }));

/** The file on screen, rendered. Links and pictures go through Rust (src/lib/actions.ts). */
export function Viewer() {
  const doc = useStore((s) => s.doc);
  const zoom = useStore((s) => s.zoom);
  const raw = useStore((s) => s.raw);
  const scroller = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!doc) return;
    // The Markdown text as written has no headings to list.
    if (raw) {
      useStore.getState().setHeadings([]);
      return;
    }
    const el = article.current;
    if (!el) return;
    el.innerHTML = holdImages(doc.html);
    highlightCode(el);
    loadImages(el);
    useStore.getState().setHeadings(headingsOf(el));
    scroller.current?.scrollTo({ top: takeKeptScroll() ?? 0 });
  }, [doc, raw]);

  // The heading at the top, for the outline; at most once a frame.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let pending = false;
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        // A heading counts once it is in the top fifth of the view.
        const top = box.getBoundingClientRect().top + box.clientHeight / 5;
        let current: string | null = null;
        for (const h of useStore.getState().headings) {
          const el = document.getElementById(h.id);
          if (el && el.getBoundingClientRect().top <= top) current = h.id;
          else if (el) break;
        }
        useStore.getState().setCurrent(current);
      });
    };
    onScroll();
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [doc, raw]);

  // The article takes the keys (space, page down…) without a click first.
  useEffect(() => scroller.current?.focus({ preventScroll: true }), [doc?.path]);

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (!a || href === null || href === undefined) return;
    e.preventDefault();
    void followLink(href);
  };

  return (
    <div ref={scroller} data-article tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none">
      {raw ? (
        // The text as written: no rendering, so no links or pictures either.
        <pre
          className="mx-auto max-w-[860px] px-10 pt-8 pb-24 font-mono leading-relaxed break-words whitespace-pre-wrap text-fg"
          style={{ fontSize: `${BASE_FONT * zoom}px` }}
        >
          {doc?.source}
        </pre>
      ) : (
        <article
          ref={article}
          onClick={onClick}
          className="markdown mx-auto max-w-[860px] px-10 pt-8 pb-24"
          style={{ fontSize: `${BASE_FONT * zoom}px` }}
        />
      )}
    </div>
  );
}
