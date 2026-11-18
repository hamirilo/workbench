# Project Context

AI と人が実装前に確認する **現在の前提**。機能要件、ロードマップ、画面仕様は `README.md` に置き、ここには書かない。
変更したら日付を更新する。変更の理由を将来説明する価値がある場合だけ、別の ADR を残す。

**更新日**：2026-11-18

| 項目 | 現在の前提 |
|---|---|
| ツールの種類 | ウィンドウアプリ（1 ウィンドウに 1 ファイル） |
| UI の実装 | React + zustand + Tailwind 4 |
| できること | 見るだけ（利用者と相談して決めた。2026-11-18）。編集・保存はしない。機能は、開く・ドロップ・GFM の表示・目次・コードの色分け・保存で自動の読み込み直し・.md の関連付け・文字の大きさ |
| Markdown の描画 | Rust の comrak（GFM。生の HTML は通さない）。コードの色分けはフロントの highlight.js（よく使う言語と PowerShell・バッチ） |
| 保存の検知 | 開いているファイルの更新日時と大きさを 0.7 秒ごとに見る（`commands.rs` の `watch`）。ネットワークの共有フォルダでも同じに動くように、OS の変更通知は使わない |
| 文字コード | UTF-8（BOM 付きも）。UTF-8 として読めなければ Shift_JIS |
| データの置き場 | `settings.json`（アップデートの自動確認）だけ。目次の表示と文字の大きさは `localStorage` |
| 外との接続 | なし（自分から出る通信は updater の feed だけ。Web 上の画像は表示しない） |
| 配布の形 | workbench 同居（Platform Optional「複数ツール同居リポジトリ」。tag `markdown-viewer-v*`、feed は固定リリース `markdown-viewer-updater`） |
| 識別子 | `dev.workbench.markdown-viewer`（一度配布したら変えない） |
| productName | `Markdown Viewer`（空白入り。CI がリリースのファイル名の空白を `_` に変える） |
| 主な利用 OS | Windows（社内のほぼ全員）。macOS も Platform の基準どおり配布するが、確認の優先度は Windows を先にする |
| desktop-base | 未採用（まだ無い）。Disk Analyzer の雛形から写す。desktop-base ができたら差し替える |
| updater の署名鍵 | workbench の Secrets の鍵（ほかのツールと同じ。公開鍵 ID `50FEA12A1D8F04D1`） |

## 該当しない Standard

- Optional「ローカル受付」は該当なし（外との接続が無い）
- Optional「トレイ常駐」は該当なし（ウィンドウアプリ）
- Architecture §6 の SQLite とロックファイルは該当なし（ディスクに持つデータが無い）
- Security §3 の asset protocol は使わない（画像は Rust が読んで data: URL で渡す）

## 逸脱

- [ADR-0001](adr-0001-theme-follows-os.md)：テーマは OS に合わせてライト / ダークを切り替える（UI §1 から）
