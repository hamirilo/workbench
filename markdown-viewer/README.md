# Markdown Viewer

Markdown のファイルを読みやすく表示するデスクトップアプリ（Tauri 2 / Windows・macOS）。

**見るだけ** のアプリで、ファイルを書き換えることはない。書くのは手持ちのエディタで、このアプリは横に置いて読むために使う。

## 機能

- 「開く」（⌘O）、ウィンドウへのドロップ、.md のダブルクリックで開く
- GitHub と同じ書き方（GFM）を表示：表、チェックリスト、取り消し線、脚注、URL の自動リンク。先頭の front matter（`---` で囲んだ部分）は出さない
- コードブロックは言語ごとに色分け（SQL、Python、JavaScript、シェル、PowerShell、バッチなど）
- 左に目次（⌘⇧O で出し入れ）。押すとその見出しへ移り、いま読んでいる見出しに印が付く
- ほかのエディタで保存すると、自動で読み込み直す（スクロールの位置はそのまま）。共有フォルダのファイルでも動く
- 文字の大きさを変えられる（⌘+ / ⌘- / ⌘0。次に開いたときも同じ）
- ライト / ダークは OS の設定に合わせる
- UTF-8 でないファイルは Shift_JIS として読む（ステータスバーに出る）

### 表示しないもの

- ファイルに直接書いた HTML（`<div>`、`<br>` など）。安全のため、Markdown の書き方で作れるものだけを表示する
- Web 上の画像（`https://…/badge.svg` など）。代わりに代替テキストを枠で出す。ファイルの近くにある画像は表示する

### リンク

| リンク先 | 押したとき |
|---|---|
| `#見出し` | その見出しへ移る |
| `https://…`、`mailto:` | ブラウザ / メールで開く |
| ほかの Markdown のファイル | このアプリで開く |
| それ以外のファイル | エクスプローラー / Finder で表示する（実行はしない） |

## キーボード

Windows は ⌘ → Ctrl。

| キー | 操作 |
|---|---|
| ⌘O | 開く |
| ⌘R | 読み込み直す |
| ⌘W | 閉じる（スタート画面に戻る） |
| ⌘⇧O | 目次を出す / 隠す |
| ⌘+ / ⌘- / ⌘0 | 文字を大きく / 小さく / 標準に |
| Home / End | 先頭へ / 末尾へ |
| ⌘⇧R | エクスプローラー / Finder で表示 |
| ⌘⇧C | パスをコピー |
| ⌘, | 設定 |
| ? | ショートカット一覧 |

## インストール

[Releases](https://github.com/hamirilo/workbench/releases?q=markdown-viewer) から入れる。Apple や Microsoft の署名をしていないので、**初回だけ** 警告が出る。

- **Windows**：`-setup.exe` を実行 → SmartScreen が出たら「詳細情報」→「実行」
- **macOS**：`.dmg` を開いて「アプリケーション」へコピー → 起動すると「開発元を検証できない」と出るので「完了」→ **システム設定 › プライバシーとセキュリティ** の下にある「このまま開く」。ターミナルで `xattr -dr com.apple.quarantine "/Applications/Markdown Viewer.app"` でもよい

インストールすると、.md などを開けるアプリとして登録される。ほかのアプリで開くようになっているときは、ファイルを右クリック →「プログラムから開く」で Markdown Viewer を選び、「常にこのアプリで開く」（Windows）／「情報を見る › このアプリケーションで開く › すべてを変更」（macOS）にする。

## アップデート

起動して数秒後に新しいバージョンを確かめ、あれば「Markdown Viewer の新しいバージョンがあります」のダイアログで知らせる。「更新して再起動」で入れ替わる（2 回目以降は警告が出ない）。何が変わったかはダイアログに載せず、「更新内容を見る」で GitHub のリリースのページを開く。「あとで」にしたものは設定（⌘,）の「アップデート」から入れられる。

手動では **Markdown Viewer › アップデートを確認…**（Windows は **ヘルプ › アップデートを確認…**）か、設定の「アップデートを確認」。自動の確認は設定で止められる。更新して起動し直した最初の 1 回だけ、更新したことをトーストで知らせる（［更新内容を見る］付き）。

## ログ

**ヘルプ › ログを表示** で開く。開いたファイルと、開けなかったときの理由が残る。

- macOS：`~/Library/Logs/dev.workbench.markdown-viewer/markdown-viewer.log`
- Windows：`%LOCALAPPDATA%\dev.workbench.markdown-viewer\logs\markdown-viewer.log`

## 開発

開発の基準は [desktop-platform](https://github.com/jazmf-dx/desktop-platform) に従う。前提は [decisions/project-context.md](decisions/project-context.md)、設計は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。コマンドは `markdown-viewer/` で実行する。

```bash
bun install
bun run tauri dev      # アプリを起動
bun run dev            # ブラウザで UI だけ（モック。src/dev/mockBackend.ts）
bun run test           # cargo test + tsc --noEmit
bun run lint           # eslint + cargo fmt --check + clippy
```

Linux で Rust をビルドするには `libwebkit2gtk-4.1-dev` などが要る（CI の `test` job と同じ）。

## 構成

| 場所 | 中身 |
|---|---|
| `src/` | React の UI。`lib/commands.ts` がコマンド表、`lib/api.ts` が Rust コマンドの型付きラッパ、`lib/actions.ts` が開く・リンク・目次の移動、`lib/highlight.ts` がコードの色分け、`components/Viewer.tsx` が本文、`components/Outline.tsx` が目次 |
| `src-tauri/src/` | Rust。`lib.rs` が plugin の配線と OS から来るファイルの受け取り、`commands.rs` がフロントから呼ぶコマンドと保存の検知、`render.rs` が Markdown → HTML、`doc.rs` がファイルを読む・画像・リンクの解決 |
| `src-tauri/tests/ipc.rs` | コマンドを JS と同じ引数で IPC 越しに呼ぶテスト（Tauri のモックランタイム） |
| `src-tauri/icons/` | アプリアイコン（`app-icon.svg` から `bunx tauri icon` で生成） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 設計（安全のための決まり、ファイルの受け渡し、保存の検知、テスト） |

雛形（`proxy.rs`、`settings.rs`、`log.ts`、`titleBar.ts`、`update.ts`、`menuBar.ts`、`Toasts.tsx`、ビルド設定）は [Disk Analyzer](../disk-analyzer/) から写した。desktop-base ができたら差し替える。

設定画面の枠と行（`SettingsFrame.tsx`）と「アップデート」の節（`UpdateSection.tsx`）は stockroom と同じファイルを置いている（desktop-platform UI §9）。直すときはすべてのツールで同じに直す。

## リリース

workbench の決まり（リポジトリ直下の README「リポジトリの決まりごと」、Platform Optional「複数ツール同居リポジトリ」）に従う。

1. バージョンを `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` の 3 か所で上げ、lockfile も更新する（`bun pm version X --no-git-tag-version`、`cargo update -p markdown-viewer --manifest-path src-tauri/Cargo.toml`）
2. `CHANGELOG.md` に `## <version>` の節を書く（変更点 / ダウンロード / 注意。リリースの本文になる。アップデートのダイアログと設定の「更新内容」からこのページへ飛ぶ）
3. `chore: markdown-viewer v<version>` を PR で `main` に入れる
4. Actions › **markdown-viewer** › **Run workflow** で `main`、`release` にチェックを入れて実行する。`markdown-viewer-v<version>` の tag を push しても同じ
5. CI が tag と version の一致、CHANGELOG の節、更新ファイルの有無を確かめ、`Markdown Viewer v<version>` のリリースを作って公開し、固定リリース `markdown-viewer-updater` の `latest.json` を差し替える。配布済みのアプリはここを見て更新する

製品名に空白があるので、CI はリリースに載せるファイル名の空白を `_` に変える（GitHub が空白を `.` に変えて、`latest.json` の URL とずれるため）。

署名鍵は workbench の Secrets（`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。ほかのツールと共有）。**`markdown-viewer-updater` のリリースと tag は消さない**（配布済みのアプリが更新を見つけられなくなる）。
