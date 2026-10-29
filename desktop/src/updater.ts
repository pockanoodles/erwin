import fs from "node:fs";
import path from "node:path";

import { app } from "electron";

/**
 * Self-update, only where nothing else delivers updates.
 *
 * The app stores, Snap and the Linux package managers (deb, rpm, AUR) each
 * update Erwin themselves, and a second updater fighting them breaks installs.
 * What is left is the direct downloads from GitHub Releases: the macOS
 * DMG/zip, the Windows installer and the AppImage. Those check the release
 * feed on launch and install on the next quit. On Linux that leaves only the
 * AppImage, which is why a snap needs no check of its own.
 *
 * An ad-hoc signed macOS build (release.yml without the Apple secrets) can't
 * replace itself either: Squirrel.Mac checks the new app against the running
 * app's signature, and an ad-hoc signature names only that one build. Homebrew
 * or a new download updates it.
 */
export function startUpdater(log: (line: string) => void): void {
  if (updatesHandledElsewhere()) {
    log("updater: disabled, this install is updated by its store, its package manager or a new download");
    return;
  }
  // Loaded lazily: store builds never touch it.
  import("electron-updater")
    .then(({ autoUpdater }) => {
      autoUpdater.logger = { info: log, warn: log, error: log, debug: () => undefined };
      autoUpdater.autoInstallOnAppQuit = true;
      return autoUpdater.checkForUpdatesAndNotify();
    })
    .catch((error: unknown) => log(`updater: ${error instanceof Error ? error.message : String(error)}`));
}

function updatesHandledElsewhere(): boolean {
  if (!app.isPackaged) return true;
  if (process.mas || process.windowsStore) return true;
  if (process.platform === "linux" && !process.env.APPIMAGE) return true;
  if (process.platform === "darwin" && buildKind() === "adhoc") return true;
  return false;
}

/** `erwinBuild` in the packed package.json; release.yml sets it with -c.extraMetadata. */
function buildKind(): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")) as {
      erwinBuild?: unknown;
    };
    return typeof pkg.erwinBuild === "string" ? pkg.erwinBuild : undefined;
  } catch {
    return undefined;
  }
}
