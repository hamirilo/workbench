# workbench

[desktop-platform](https://github.com/jazmf-dx/desktop-platform) の決まりで作るデスクトップアプリを置いておくリポジトリです。ツールごとにディレクトリを分けています。

会社の PC 向けの社内版は、このリポジトリのフォーク [jazmf-dx/desktop-apps](https://github.com/jazmf-dx/desktop-apps) で作っています（下の「フォークで使うとき」）。

| ツール | 説明 | ダウンロード |
| --- | --- | --- |
| [Shelf](shelf/) | ファイルを移動するときの一時置き場になる、Yoink 風の小さなアプリ（macOS / Windows） | [Releases](https://github.com/hamirilo/workbench/releases?q=shelf) |
| [Clip](clip/) | メールアドレスや電話番号などのよく使う文字と、コピーの履歴を、ショートカット 1 つで呼び出して入力するアプリ（macOS / Windows） | [Releases](https://github.com/hamirilo/workbench/releases?q=clip) |
| [Renamer](renamer/) | フォルダの中のファイル名を、ルールに沿って一括で変えるアプリ。プレビューと取り消し付き（Windows / macOS） | [Releases](https://github.com/hamirilo/workbench/releases?q=renamer) |
| [Disk Analyzer](disk-analyzer/) | ドライブやフォルダの中で何が容量を使っているかを、DaisyDisk 風のグラフ（サンバースト・ツリーマップ・アイシクル）と一覧で見るアプリ（Windows / macOS） | [Releases](https://github.com/hamirilo/workbench/releases?q=disk-analyzer) |
| [Meter](meter/) | CPU・メモリ・ディスク・ネットワークの使用状況をタスクトレイ（macOS はメニューバー）にいつも出し、クリックでグラフと重いアプリの一覧を見るアプリ（Windows / macOS） | [Releases](https://github.com/hamirilo/workbench/releases?q=meter) |

大きくなったアプリは単独のリポジトリに分けています：[Video Studio](https://github.com/hamirilo/video-studio)（社内版は jazmf-dx/video-studio）、PDF One（社内だけ。jazmf-dx/pdf-one）。

## リポジトリの決まりごと

- ツールは `<名前>/` ディレクトリにまとめ、使い方と開発手順はそのディレクトリの `README.md` に書きます
- CI はツールごとに `.github/workflows/<名前>.yml` を置き、そのディレクトリが変わったときだけ動くようにします
- リリースのタグは `<名前>-v<バージョン>`（例: `shelf-v0.1.1`）です
- アプリ内アップデートの配信には、ツールごとの固定のリリース `<名前>-updater`（例: `shelf-updater`）を使います。`releases/latest` は他のツールのリリースと取り合いになるためです
- 更新の配信先は `tauri.conf.json` の `plugins.updater.endpoints` の 1 つ目だけに書きます。コードはそこから、更新を確かめるときのプロキシの判定と「更新内容を見る」のページ（`<名前>-updater` → `<名前>-v<バージョン>`）を決めます（各ツールの `src-tauri/src/feed.rs`）

## フォークで使うとき

[jazmf-dx/desktop-apps](https://github.com/jazmf-dx/desktop-apps) は、このリポジトリに「社内版だけのファイル」を足したフォークです。詳しくはフォークの `docs/CORP.md`。

- フォークに置くのは新しいファイルだけにします（社内版の設定 `src-tauri/tauri.corp.conf.json`、社内版のワークフローなど）。このリポジトリにあるファイルをフォークで変えると、取り込むたびに衝突します
- フォークで見つけた不具合や改善は、このリポジトリで直してから取り込みます
- フォークのビルドは、重ねる設定ファイル（`tauri build --config`）で `identifier`・`productName`・`plugins.updater` の `pubkey` と `endpoints` をその版のものにします。配信先を `corp-<名前>-updater` にすれば、更新内容のページも `corp-<名前>-v<バージョン>` になるので、コードは変えなくてよいです
