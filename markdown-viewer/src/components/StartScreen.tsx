import { FileText } from "lucide-react";
import { command, runCommand } from "../lib/commands";
import { comboText } from "../lib/keys";

/** Nothing open: a file of one's own, or a drop. */
export function StartScreen() {
  const open = command("file.open");
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line px-8 py-12 text-center text-dim">
        <FileText size={36} strokeWidth={1.5} />
        <div className="text-[15px] text-fg">Markdown のファイルをここへドロップ</div>
        <div className="text-xs leading-relaxed">
          見出し・表・チェックリスト・コードを読みやすく表示します。
          <br />
          ほかのエディタで保存すると、表示も自動で新しくなります。ファイルを書き換えることはありません。
        </div>
        <button onClick={() => runCommand(open.id)} className="mt-3 rounded-md bg-accent px-4 py-1.5 text-white hover:brightness-110">
          ファイルを開く（{comboText(open.keys![0])}）
        </button>
      </div>
    </div>
  );
}
