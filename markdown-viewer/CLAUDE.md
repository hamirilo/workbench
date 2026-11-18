# Markdown Viewer

Markdown のファイルを読みやすく表示する、見るだけのデスクトップアプリ（Tauri 2 / Windows・macOS）

## 開発の基準

開発の Standard・Recommendations・Playbook は **`../../desktop-platform/ai/ONBOARDING.md`** を最初に参照すること（採用 tag：v0.5.0）。Web アプリ向けの ai-dev-platform は参照しない。

実装へ大きく影響する前提は `decisions/project-context.md` にある。先に読む。Standard から外れているところは `decisions/` の ADR にある。

モデルは desktop-platform の Governance §3.1 のティアで使い分ける。設計・難しい障害調査・重要なレビューは本体のモデル、通常の実装と文書は Sonnet、テスト実行・スクリーンショット・lint などの確認は Haiku のサブエージェントへ委譲する。委譲した結果は本体が確認してから次へ進む。

## このツール固有

- 設計の境界：`docs/ARCHITECTURE.md`
- **見るだけのアプリ**。編集・保存・ファイルの作成や削除の機能は、人の判断なしに足さない。リンク先のファイルも実行せず、Finder / エクスプローラーで表示するだけ
- Markdown は Rust 側（`render.rs`、comrak）で HTML にする。ファイルの生の HTML は通さない（`render.r#unsafe = false`）。通すように変えるなら、サニタイズを入れて人が判断する
- 画像は Rust の `read_image` から data: URL で渡す（開いているファイルの近くだけ、中身で種類を判定）。Web 上の画像やリンク先は取りに行かない
- 操作はコマンド表 `src/lib/commands.ts` にまず足す
- Rust コマンドは `src/lib/api.ts` のラッパ経由で呼ぶ。モック `src/dev/mockBackend.ts` も同じ PR で更新する
- 描画のオプションを変えたら `render.rs` のテストを足す。表示の見た目は `src/index.css` の `.markdown` にまとめる

## コマンド

```bash
bun install
bun run tauri dev      # アプリを起動
bun run dev            # ブラウザで UI だけ（モック）
bun run test           # cargo test + tsc --noEmit（`bun test` は Bun のテストランナーなので使わない）
bun run lint
bun run tauri build    # 配布用ビルド（署名鍵が要る。README「リリース」）
```

## 変えないもの

`identifier`、`productName`、updater の `pubkey` と `endpoints`、CSP の緩和、capabilities の追加は人の判断なしに変えない。
