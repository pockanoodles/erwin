/**
 * The only bridge between web content and the shell, kept deliberately thin.
 *
 * App pages get `window.erwinDesktop` (platform and version, nothing that can
 * act), so the UI can make room for the macOS traffic lights and label itself.
 * The boot screen also gets restart and open-logs, which only matter there.
 */

import { contextBridge, ipcRenderer } from "electron";

const versionArg = process.argv.find((arg) => arg.startsWith("--erwin-version="));

/** The two DOM calls a preload makes, typed here so the shell needs no DOM lib. */
const page = globalThis as unknown as {
  location?: { protocol: string };
  document: { documentElement: { setAttribute(name: string, value: string): void } | null };
  addEventListener(type: "DOMContentLoaded", listener: () => void, options: { once: boolean }): void;
};

// The app's CSS reads this to turn its top bar into the window's title bar
// (room for the macOS traffic lights, a drag region). Set before first paint.
const markDesktop = () => page.document.documentElement?.setAttribute("data-desktop", process.platform);
if (page.document.documentElement) markDesktop();
else page.addEventListener("DOMContentLoaded", markDesktop, { once: true });

contextBridge.exposeInMainWorld("erwinDesktop", {
  platform: process.platform,
  version: versionArg ? versionArg.slice("--erwin-version=".length) : "",
});

if (page.location?.protocol === "file:") {
  contextBridge.exposeInMainWorld("erwinBoot", {
    restart: () => ipcRenderer.invoke("erwin:boot:restart"),
    openLogs: () => ipcRenderer.invoke("erwin:boot:open-logs"),
  });
}
