import { command, isEnabled, runCommand } from "../lib/commands";
import { comboText } from "../lib/keys";
import { dragRegion } from "../lib/titleBar";
import { useStore } from "../store";

function CommandButton({ id, label }: { id: string; label?: string }) {
  const c = command(id);
  const enabled = useStore((s) => isEnabled(c, s));
  const on = useStore((s) => c.checked?.(s) ?? false);
  const Icon = c.icon;
  return (
    <button
      onClick={() => runCommand(id)}
      disabled={!enabled}
      aria-pressed={c.checked ? on : undefined}
      title={c.keys ? `${c.title}（${comboText(c.keys[0])}）` : c.title}
      aria-label={c.title}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-hover disabled:opacity-40 ${
        on ? "bg-hover text-accent" : "bg-raised"
      }`}
    >
      {Icon && <Icon size={15} />}
      {label}
    </button>
  );
}

/** The file's name in the middle; the buttons keep their places with or without a file (Platform UI §10). */
export function Toolbar() {
  const name = useStore((s) => s.doc?.name ?? "");
  const loading = useStore((s) => s.loading !== null);
  return (
    <header
      {...dragRegion(true)}
      className="flex h-[max(var(--titlebar),44px)] shrink-0 items-center gap-2 border-b border-line bg-panel pr-3 pl-[max(var(--traffic-lights),12px)]"
    >
      <CommandButton id="view.outline" />
      <div className="min-w-0 flex-1 truncate text-center font-semibold" title={name}>
        {name}
        {loading && <span className="ml-2 font-normal text-dim">読み込み中…</span>}
      </div>
      <CommandButton id="file.reload" />
      <CommandButton id="file.reveal" />
      <CommandButton id="file.open" label="開く" />
    </header>
  );
}
