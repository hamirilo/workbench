import { isTauri } from "@tauri-apps/api/core";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "pdfjs-dist/web/pdf_viewer.css";
import "./index.css";
import { setHost, type Host } from "./host";
import { logUncaughtErrors } from "./lib/log";
import { setUpTitleBar } from "./lib/titleBar";

/**
 * Where the app runs (ADR-0004): the desktop app in Tauri; in a browser the
 * real PDF code built as WebAssembly (docs/WASM.md, `npm run build:wasm`), or
 * with `?backend=mock` the made-up sample. The browser's code and its font
 * are left out of the app's build: they are only imported in development.
 */
async function chooseHost(): Promise<Host> {
  if (isTauri()) return (await import("./host/desktop")).desktopHost;
  if (import.meta.env.DEV) {
    const mock = async () => (await import("./dev/mockHost")).mockHost;
    if (new URLSearchParams(location.search).get("backend") === "mock") return mock();
    try {
      const { createWebHost } = await import("./host/web");
      // Noto Sans JP (SIL OFL 1.1), the static Regular: the subsetter can't do variable fonts.
      const fontUrl = (await import("@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf?url")).default;
      // Served by Vite from wasm/pkg/ (not in git: `npm run build:wasm`).
      return await createWebHost({ engineUrl: "/wasm/pkg/pdf_one_wasm.js", wasmUrl: "/wasm/pkg/pdf_one_wasm_bg.wasm", fontUrl });
    } catch (e) {
      console.warn("ブラウザ版のエンジンを読めないので、見本（?backend=mock）で動かします。`npm run build:wasm` で作れます:", e);
      return mock();
    }
  }
  throw new Error("このビルドはデスクトップアプリ用です。ブラウザ版は @jazmf-dx/pdf-one-web（docs/WASM.md）");
}

async function main() {
  logUncaughtErrors();
  setUpTitleBar();
  setHost(await chooseHost());
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

main();
