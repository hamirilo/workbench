// Dev-only in-memory stand-in for the Rust backend, used when the UI is
// opened in a normal browser (`bun run dev`) instead of inside Tauri
// (Platform playbook: ブラウザで UI を作る). Answers the same commands as
// src/lib/api.ts with the same types, closely enough for UI work; change
// both in the same PR. Every file "opened" is the same made-up manual,
// written as comrak renders it (src-tauri/src/render.rs).
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { AppSettings, Doc } from "../lib/api";

let settings: AppSettings = { autoUpdate: true };
let current: string | null = null;
let saves = 0;

const HTML = (n: number) => `<h1 id="受注システムの使い方">受注システムの使い方</h1>
<p>営業部向けの手順書です。<strong>初めての方は</strong>「<a href="#ログイン">ログイン</a>」から読んでください。最終更新は${n ? ` ${n} 回目の保存` : "初版"}。</p>
<blockquote>
<p>困ったときは情報システム課（内線 1234）へ。</p>
</blockquote>
<h2 id="ログイン">ログイン</h2>
<ol>
<li>デスクトップの「受注」アイコンを開きます</li>
<li>社員番号とパスワードを入れます</li>
<li><kbd>Enter</kbd> を押します</li>
</ol>
<p><img data-src="img/ログイン画面.png" alt="ログイン画面" /></p>
<h2 id="受注の入力">受注の入力</h2>
<h3 id="得意先を選ぶ">得意先を選ぶ</h3>
<p>得意先コードは 6 桁です。<code>F2</code> で一覧から選べます。</p>
<table>
<thead>
<tr>
<th>区分</th>
<th>コード</th>
<th>例</th>
</tr>
</thead>
<tbody>
<tr>
<td>量販店</td>
<td>1xxxxx</td>
<td>100231</td>
</tr>
<tr>
<td>外食</td>
<td>2xxxxx</td>
<td>204410</td>
</tr>
<tr>
<td>加工業者</td>
<td>3xxxxx</td>
<td>310078</td>
</tr>
</tbody>
</table>
<h3 id="明細を入れる">明細を入れる</h3>
<ul class="contains-task-list">
<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled="" checked="" /> 品目を選ぶ</li>
<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled="" /> 数量と単価を入れる</li>
<li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled="" /> 納品日を確かめる</li>
</ul>
<h2 id="データの取り出し">データの取り出し</h2>
<p>月末の集計は次のクエリで取れます。</p>
<pre><code class="language-sql">SELECT 得意先コード, SUM(金額) AS 合計
FROM 受注明細
WHERE 受注日 BETWEEN '2026-10-01' AND '2026-10-31'
GROUP BY 得意先コード
ORDER BY 合計 DESC;
</code></pre>
<p>PowerShell で CSV にするとき：</p>
<pre><code class="language-powershell">Get-Content .\\受注.csv -Encoding UTF8 | Select-Object -First 10
</code></pre>
<h2 id="よくある質問">よくある質問</h2>
<h3 id="パスワードを忘れた">パスワードを忘れた</h3>
<p>社内ポータルの<a href="https://example.com/reset">パスワード再設定</a>から。詳しくは <a href="faq.md">FAQ</a> も見てください<sup class="footnote-ref"><a href="#fn-1" id="fnref-1" data-footnote-ref>1</a></sup>。</p>
<p><del>旧システムの手順</del> は使いません。</p>
<hr />
<section class="footnotes" data-footnotes>
<ol>
<li id="fn-1">
<p>FAQ は毎月更新しています。 <a href="#fnref-1" class="footnote-backref" data-footnote-backref aria-label="Back to reference 1">↩</a></p>
</li>
</ol>
</section>
`;

function doc(path: string): Doc {
  return {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    html: HTML(saves),
    encoding: "UTF-8",
    size: 2_480 + saves,
    modified: Date.now(),
  };
}

const PICTURE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="160"><rect width="420" height="160" rx="10" fill="#4c8dff" opacity=".18"/><text x="210" y="86" font-size="18" text-anchor="middle" fill="#4c8dff">ログイン画面（モック）</text></svg>`,
)}`;

async function handle(cmd: string, payload: unknown): Promise<unknown> {
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (cmd) {
    case "get_app_settings":
      return settings;
    case "set_app_settings":
      settings = args.settings as AppSettings;
      return settings;
    case "system_proxy":
      return null;
    case "open_release_page":
    case "reveal_log":
      console.info("[mock]", cmd);
      return null;
    case "open_doc":
      await new Promise((r) => setTimeout(r, 120));
      current = args.path as string;
      return doc(current);
    case "close_doc":
      current = null;
      return null;
    case "take_pending_file":
      return null;
    case "read_image":
      if (!current) throw "ファイルを開いていません";
      return PICTURE;
    case "follow_link":
      return `C:\\Users\\demo\\手順書\\${args.href as string}`;
    case "open_url":
      console.info("[mock] open", args.url);
      return null;
    case "reveal_doc":
      console.info("[mock] reveal", current);
      return null;
    case "plugin:dialog|open":
      return "C:\\Users\\demo\\手順書\\受注システムの使い方.md";
    default:
      if (cmd.startsWith("plugin:")) return null;
      throw new Error(`[mock] ${cmd} は未対応です`);
  }
}

export function installMockBackend() {
  mockWindows("main");
  mockIPC((cmd, payload) => handle(cmd, payload), { shouldMockEvents: true });
  // A save in another editor, every 20 s, so reading again can be seen.
  setInterval(() => {
    if (!current) return;
    saves++;
    void emit("doc-changed", current);
  }, 20_000);
  console.info("[mock] in-memory backend installed");
}
