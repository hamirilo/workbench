// The PDF code (src-tauri/src/pdf/) built as WebAssembly: wasm/, docs/WASM.md.

/** wasm/src/lib.rs, as wasm-bindgen exports it. */
export interface Engine {
  default: (init?: { module_or_path: string }) => Promise<unknown>;
  setFont(bytes: Uint8Array, family: string): boolean;
  open(bytes: Uint8Array): string;
  takeView(id: number): Uint8Array;
  close(id: number): void;
  textLines(id: number, index: number): string;
  compose(request: string): Uint8Array;
  addImage(bytes: Uint8Array): string;
  imageBytes(id: number): Uint8Array;
}

/** Loads the engine's script and starts its wasm. Throws when either can't be read. */
export async function loadEngine(engineUrl: string, wasmUrl: string): Promise<Engine> {
  const engine = (await import(/* @vite-ignore */ engineUrl)) as Engine;
  await engine.default({ module_or_path: wasmUrl });
  return engine;
}

/** The engine throws strings, as the Tauri commands do. */
export function call<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    throw typeof e === "string" ? e : String(e);
  }
}
