# ADR-0004：デスクトップとブラウザを切り替えるホストの層

**日付**：2026-10-19
**状態**：採用

## 背景

PDF One の画面と保存の処理を、DX ポータルの便利ツール「PDF 編集」でも使う（docs/WASM.md §5）。画面（`src/`）と PDF の処理（`src-tauri/src/pdf/`、ブラウザでは wasm）は 1 つのまま、デスクトップ版（Tauri）とブラウザ版の 2 つの出口を持つ。ブラウザ版はあとで npm パッケージ `@jazmf-dx/pdf-one-web` にする。

試し（2026-10-16）では、ブラウザで Tauri の `invoke` を `mockIPC` で受けて答えていた。これは開発用の仕組みで、次の問題がある。

- ブラウザ版が Tauri の内部（`__TAURI_INTERNALS__`、`plugin:dialog|…` の名前）に頼る
- 「上書き保存」「フォルダに分割」「ファイルの場所を開く」など、ブラウザでできないことを、画面が知らないまま呼ぶ
- 確認のダイアログが、モックでは何も聞かずに「OK」になる

## 決定

画面と Tauri のあいだに **ホスト**（`src/host/`）を置く。画面は Tauri の API を直接呼ばず、ホストを通す。

```
src/host/
  types.ts     Host / Backend / Dialogs / Capabilities の型
  index.ts     setHost() と host()。起動時に 1 つ決める
  desktop.ts   Tauri：invoke と plugin-dialog（今の動きのまま）
  web/         ブラウザ：wasm の処理、ファイル選択、ダウンロード、画面の中のダイアログ
src/dev/mockHost.ts   開発用の見本（wasm を作らずに画面を触る。?backend=mock）
```

- **Backend**：今の `api`（Rust のコマンド）と同じ形。`lib/api.ts` の `api` は、そのときのホストの Backend に渡すだけにする。型（`AppSettings`、`Annot` …）は `lib/api.ts` に残す
- **Dialogs**：ファイルを開く・フォルダを選ぶ・保存先を聞く・確かめる。デスクトップは OS のダイアログ、ブラウザはファイル選択と画面の中のダイアログ（`Modal`）
- **Capabilities**：ホストにできること。画面はこれを見て、できないことを出さない
  - `overwrite`：元のファイルへの上書きとバックアップ。ブラウザは無い（保存は毎回ダウンロード）
  - `folders`：フォルダへの書き出し（分割）。ブラウザは 1 ファイルずつダウンロード
  - `reveal`：ファイルの場所・ログ・バックアップを開く
  - `recent`：最近使ったファイル
  - `updates`：アプリ内アップデート
- Tauri だけの機能（メニューバー、タイトルバー、OS 通知、ログ、アップデート）は、今の `isTauri()` の分岐のまま。ホストの外に置く
- `@tauri-apps/api/mocks` は使わない

## 結果

- デスクトップ版の動きは変わらない
- ブラウザ版は、Tauri の内部に頼らずに動く。npm パッケージにするとき（次の段）は `web/` と画面を出すだけで済む
- 画面から Tauri を呼ぶ所が増えたら、ホストに足す
- ブラウザ版の設定・印鑑・下書きは、この段ではメモリだけ（ページを閉じると消える）。IndexedDB に残すのは次の段
