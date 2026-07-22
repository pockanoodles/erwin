import { createJSONStorage } from "zustand/middleware";

/**
 * No-op Storage for SSR and environments where `localStorage` is missing or broken
 * (e.g. Node experimental localStorage with invalid `--localstorage-file`).
 */
const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

function getClientLocalStorage(): Storage {
  const candidates: Storage[] = [];
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      candidates.push(window.localStorage);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      const gl = (globalThis as unknown as { localStorage?: Storage })
        .localStorage;
      if (gl) {
        candidates.push(gl);
      }
    }
  } catch {
    /* ignore */
  }

  for (const ls of candidates) {
    if (ls != null && typeof ls.getItem === "function") {
      try {
        ls.getItem("__z");
        return ls;
      } catch {
        /* broken or blocked */
      }
    }
  }
  return noopStorage;
}

/**
 * Pass to zustand `persist({ storage: ssrSafeJsonStorage, ... })` so Next.js SSR
 * and broken Node `localStorage` do not throw.
 */
export const ssrSafeJsonStorage = createJSONStorage(getClientLocalStorage);
