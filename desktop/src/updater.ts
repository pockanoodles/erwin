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
 */
export function startUpdater(log: (line: string) => void): void {
  if (updatesHandledElsewhere()) {
    log("updater: disabled, this install is updated by its store or package manager");
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
  return false;
}
