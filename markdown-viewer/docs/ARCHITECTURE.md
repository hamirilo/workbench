# 設計

Platform の [Architecture Standard](../../../desktop-platform/standards/architecture.md) に沿う。ここにはこのツール固有の境界だけを書く。

## 1. 方針

- **見るだけ**。ユーザーのファイルに書き込む処理は無い。書き込むのは設定ファイルとログだけ
- Markdown を HTML にするのは Rust 側（`render.rs`）。フロントは受け取った HTML をそのまま入れ、コードの色分け（`lib/highlight.ts`）と画像の差し込みだけをする
- 開いたファイルは誰が書いたか分からないものとして扱う（Platform Security §4）
  - 生の HTML は通さない（comrak の `unsafe = false`。`<script>`、`onerror=` などはページに入らない。`javascript:` のリンクも落ちる）
  - 16 MB を超えるファイル、NUL を含むファイル（テキストでないもの）は開かない
  - 画像は開いているファイルからの相対パス（と `file://`、絶対パス）だけ。Rust が読み、先頭のバイトで種類を判定し（PNG・JPEG・GIF・WebP・BMP・AVIF・SVG）、20 MB までを data: URL で返す。SVG は `<img>` で表示するので、中のスクリプトは動かず外も読みに行かない
  - Web 上の画像は取りに行かない（CSP の `img-src` も `'self' data: blob:` のまま）。代わりに代替テキストの枠を出す
  - リンク：`#見出し` はページ内、`http(s)` と `mailto` はブラウザ、Markdown のファイルはこのアプリで開く、それ以外のファイルは Finder / エクスプローラーで表示するだけ（実行しない）

## 2. 層

| 層 | 中身 |
|---|---|
| shell | proxy、updater、log の配線、single-instance、window-state、settings.json（Disk Analyzer から写した。desktop-base ができたら差し替える） |
| core | 描画（`render.rs`）、ファイルを読む・画像・リンクの解決（`doc.rs`）、保存の検知（`commands.rs` の `watch`） |
| features | 本文（`Viewer.tsx`）、目次（`Outline.tsx`）、スタート画面、ツールバー、ステータスバー |

## 3. ファイルの受け渡し

OS から開くように言われたファイル（.md のダブルクリック、「プログラムから開く」、Finder へのドロップ）は、次の順で画面に届く。

| 場面 | 入り口 | 届け方 |
|---|---|---|
| Windows：起動のとき | 起動の引数（`lib.rs` の `file_in_args`） | `AppState.pending` に置き、ページが読み込まれたら `take_pending_file` で取る |
| Windows：起動しているとき | 2 回目の起動（single-instance の引数） | `open-file` イベント。ウィンドウを前に出す |
| macOS | `RunEvent::Opened` | `pending` に置き、`open-file` イベントも送る（起動前でも後でも届く） |

## 4. 保存の検知

- 開いているファイルの更新日時と大きさを 0.7 秒ごとに見る。変わったら 0.15 秒待って変化が止まったのを確かめ、`doc-changed` を送る。フロントは読み込み直し、スクロールの位置を保つ
- OS の変更通知（notify crate など）は使わない。ネットワークの共有フォルダでは届かないことが多く、エディタの「別名で書いて差し替える」保存でも見失いやすいため
- 消されたときも `doc-changed` が届き、読み込み直しが失敗したトーストが出る。画面は前の内容のまま

## 5. テスト

- `render.rs`：GFM の表示、同じ見出しの ID、生の HTML と `javascript:` が通らないこと、front matter、文字コード
- `doc.rs`：リンクと画像のパスの解決（`%` エスケープ、`#`）、画像の種類の判定、開けないファイル
- `tests/ipc.rs`：フロントと同じ引数でコマンドを呼ぶ（開く、画像、リンク、Web 以外の URL を開かない、閉じる）
