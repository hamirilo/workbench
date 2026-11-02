# workbench

デスクトップアプリをツールごとのディレクトリに置くリポジトリ。作業するツールのディレクトリの `CLAUDE.md` を先に読む。

- **フォークで作業するとき**：`docs/CORP.md` があればフォーク（社内版、jazmf-dx/desktop-apps）なので、最初に読む。フォークではこのリポジトリ（hamirilo/workbench）と同じファイルを変えず、変更はここに入れてから取り込む（README「フォークで使うとき」）
- 更新の配信先は `tauri.conf.json` の `plugins.updater.endpoints` だけに書く。コードに配信先やリリースの URL を書かない（各ツールの `src-tauri/src/feed.rs`）
