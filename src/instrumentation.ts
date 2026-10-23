/**
 * Runs once when the Next.js server starts.
 * Node can expose a broken experimental `globalThis.localStorage` (`getItem` not a function),
 * which breaks Zustand persist and any code touching `localStorage` during SSR.
 */

export async function register(): Promise<void> {
  patchBrokenNodeLocalStorage();

  // Installs with no worker process (the desktop app, a single-container
  // self-host) run the background sync loop in this process instead.
  // Imported lazily so the edge build never sees Prisma.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.ERWIN_SCHEDULER === "inprocess"
  ) {
    const { startSyncLoop } = await import("@/lib/erwin/sync-loop");
    startSyncLoop({ where: "in-process", firstTickDelayMs: 20_000 });
  }
}

const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

function patchBrokenNodeLocalStorage(): void {
  const g = globalThis as unknown as {
    localStorage?: Storage;
    window?: Window & typeof globalThis;
  };

  let ls: Storage | undefined;
  try {
    ls = g.localStorage;
  } catch {
    return;
  }

  const broken =
    ls != null &&
    (typeof ls.getItem !== "function" ||
      typeof ls.setItem !== "function");

  if (!broken && ls != null) {
    return;
  }

  try {
    Object.defineProperty(g, "localStorage", {
      value: noopStorage,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  } catch {
    /* ignore */
  }

  try {
    if (g.window && typeof g.window === "object") {
      Object.defineProperty(g.window, "localStorage", {
        value: noopStorage,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }
  } catch {
    /* ignore */
  }
}
