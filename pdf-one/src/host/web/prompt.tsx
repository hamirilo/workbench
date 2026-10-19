// Questions in the browser version, asked inside the page (there is no OS
// dialog to ask them): a Modal opened from a zustand store, the way
// askSaveChoice does it (src/components/Dialogs.tsx). Rendered once, by App.
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { create } from "zustand";
import { Modal } from "../../components/Modal";
import type { Dialogs, MessageOptions } from "../types";

interface Prompt extends MessageOptions {
  id: number;
  text: string;
  answer: (label: string) => void;
}

/** The first is on screen; the rest wait their turn. */
const usePrompts = create<{ queue: Prompt[] }>()(() => ({ queue: [] }));

let next = 0;

function prompt(text: string, options: MessageOptions = {}): Promise<string> {
  const buttons = options.buttons?.length ? options.buttons : ["OK"];
  return new Promise((resolve) => {
    const answer = (label: string) => {
      usePrompts.setState((s) => ({ queue: s.queue.filter((p) => p !== item) }));
      resolve(label);
    };
    const item: Prompt = { ...options, id: next++, buttons, text, answer };
    usePrompts.setState((s) => ({ queue: [...s.queue, item] }));
  });
}

/** `message` and `ask` of the browser's Dialogs. */
export const promptDialogs: Pick<Dialogs, "message" | "ask"> = {
  message: prompt,
  async ask(text, { title, okLabel = "OK", cancelLabel = "キャンセル" } = {}) {
    return (await prompt(text, { title, buttons: [okLabel, cancelLabel] })) === okLabel;
  },
};

const icons = { info: Info, warning: TriangleAlert, error: CircleAlert };

export function PromptDialog() {
  const p = usePrompts((s) => s.queue[0]);
  if (!p) return null;
  const buttons = p.buttons!;
  const cancel = buttons[buttons.length - 1];
  const Icon = icons[p.kind ?? "info"];
  // The default is on the right, the cancel on the left.
  const shown = [...buttons].reverse();
  return (
    <Modal key={p.id} title={p.title ?? "PDF One"} onClose={() => p.answer(cancel)} width={440}>
      <div className="flex items-start gap-3">
        <Icon size={20} className={`mt-0.5 shrink-0 ${p.kind === "error" ? "text-danger" : p.kind === "warning" ? "text-warn" : "text-accent"}`} />
        <p className="whitespace-pre-wrap">{p.text}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {shown.map((label) => {
          const primary = label === buttons[0];
          return (
            <button
              key={label}
              autoFocus={primary}
              onClick={() => p.answer(label)}
              className={primary ? "rounded-md bg-accent px-4 py-1.5 text-white hover:brightness-110" : "rounded-md px-3 py-1.5 hover:bg-hover"}
            >
              {label}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
