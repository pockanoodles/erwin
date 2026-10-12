import fs from "node:fs";
import path from "node:path";

import { screen, type BrowserWindow, type Rectangle } from "electron";

interface WindowState {
  bounds: Partial<Rectangle> & { width: number; height: number };
  maximized: boolean;
}

const FILE = "window.json";
const DEFAULT: WindowState = { bounds: { width: 1440, height: 900 }, maximized: false };

/** Reopens where it was closed, unless that spot is now off every screen. */
export function loadWindowState(userData: string): WindowState {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(userData, FILE), "utf8")) as WindowState;
    const { x, y, width, height } = saved.bounds;
    if (typeof x === "number" && typeof y === "number") {
      const visible = screen.getAllDisplays().some(({ workArea: a }) =>
        x < a.x + a.width && x + width > a.x && y < a.y + a.height && y + height > a.y
      );
      if (!visible) return { ...saved, bounds: { width, height } };
    }
    return saved;
  } catch {
    return DEFAULT;
  }
}

export function trackWindowState(win: BrowserWindow, userData: string): void {
  let timer: NodeJS.Timeout | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
      fs.writeFile(path.join(userData, FILE), JSON.stringify(state), () => undefined);
    }, 400);
  };
  win.on("resize", save);
  win.on("move", save);
  win.on("maximize", save);
  win.on("unmaximize", save);
}
