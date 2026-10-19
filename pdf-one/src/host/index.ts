// The host the app runs on, chosen once at startup (src/main.tsx).
import type { Host } from "./types";

export type * from "./types";

let current: Host | null = null;

export function setHost(h: Host) {
  current = h;
}

export function host(): Host {
  if (!current) throw new Error("host not set: call setHost() before anything uses it");
  return current;
}
