/**
 * Erwin desktop: the Electron main process.
 *
 * Owns the window and the app lifecycle. Everything Erwin actually does runs
 * in the runtime utility process (see runtime.ts): the database, migrations
 * and the Next server. This process starts it, hands it its keys over the
 * private parent port, shows a boot screen while it comes up, then signs the
 * one local user in and loads the app from its loopback server.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  utilityProcess,
  type UtilityProcess,
} from "electron";

import { buildMenu } from "./menu";
import type { MainToRuntime, RuntimeToMain } from "./protocol";
import { loadInstallKeys } from "./secrets";
import { startUpdater } from "./updater";
import { loadWindowState, trackWindowState } from "./window-state";

/** Fixed so OAuth redirect URIs registered against it keep working. */
const PREFERRED_PORT = 41739;

/** sun_path is 104 bytes on macOS and 108 on Linux; leave room for the file name. */
const MAX_SOCKET_DIR = 90;

const BOOT_HTML = path.join(__dirname, "..", "static", "boot.html");
const PRELOAD = path.join(__dirname, "preload.js");

let mainWindow: BrowserWindow | null = null;
let runtime: UtilityProcess | null = null;
let appOrigin: string | null = null;
let bootToken = "";
let quitting = false;
/** Set while we stop the runtime on purpose, so its exit is not reported as a crash. */
let expectingExit = false;
let logStream: fs.WriteStream | null = null;

// Development and tests can point the app at a throwaway folder, so running
// an unpackaged build never touches a real install's database.
if (!app.isPackaged && process.env.ERWIN_USER_DATA) {
  app.setPath("userData", process.env.ERWIN_USER_DATA);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(onReady).catch((error) => {
    console.error(error);
    app.exit(1);
  });
}

function paths() {
  const userData = app.getPath("userData");
  const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", ".stage");
  const socketDir = path.join(userData, "run");
  return {
    userData,
    logs: path.join(userData, "logs"),
    data: path.join(userData, "database"),
    server: path.join(resources, "server"),
    migrations: path.join(resources, "migrations"),
    // Windows has no Unix sockets for Prisma, and a long sandbox container
    // path can overflow sun_path; both fall back to loopback TCP.
    socketDir: process.platform !== "win32" && socketDir.length <= MAX_SOCKET_DIR ? socketDir : null,
  };
}

async function onReady(): Promise<void> {
  const p = paths();
  fs.mkdirSync(p.logs, { recursive: true });
  logStream = fs.createWriteStream(path.join(p.logs, "runtime.log"), { flags: "a" });
  log(`--- Erwin ${app.getVersion()} starting on ${process.platform} ${process.arch}`);

  Menu.setApplicationMenu(buildMenu({ openSettings: () => navigate("/settings"), openLogs: () => shell.openPath(p.logs) }));
  ipcMain.handle("erwin:boot:restart", () => restartRuntime());
  ipcMain.handle("erwin:boot:open-logs", () => shell.openPath(p.logs));

  createWindow();
  startRuntime();
  startUpdater(log);
}

function createWindow(): void {
  const state = loadWindowState(app.getPath("userData"));
  mainWindow = new BrowserWindow({
    ...state.bounds,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: "Erwin",
    backgroundColor: "#14130d",
    // On macOS the app's own 44px top bar is the title bar: the traffic
    // lights sit inset in it, centred on its height (see globals.css,
    // [data-desktop="darwin"]). Windows and Linux keep the native frame.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 15 } }
      : {}),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      additionalArguments: [`--erwin-version=${app.getVersion()}`],
    },
  });
  if (state.maximized) mainWindow.maximize();
  trackWindowState(mainWindow, app.getPath("userData"));

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Links leave the app: anything not served by our own server opens in the
  // default browser instead of turning the window into a browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || isAppUrl(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  // The desktop user has no password. If anything ever lands on the sign-in
  // page (a cleared cookie, a sign-out), sign them straight back in.
  mainWindow.webContents.on("did-navigate", (_event, url) => {
    if (appOrigin && url.startsWith(`${appOrigin}/auth/signin`)) void signIn();
  });

  void mainWindow.loadFile(BOOT_HTML);
}

function startRuntime(): void {
  const p = paths();
  const keys = loadInstallKeys(p.userData);
  bootToken = crypto.randomBytes(32).toString("base64url");
  expectingExit = false;

  runtime = utilityProcess.fork(path.join(__dirname, "runtime.js"), [], {
    serviceName: "Erwin Runtime",
    stdio: "pipe",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? os.homedir(),
      TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
      LANG: process.env.LANG ?? "en_US.UTF-8",
      NODE_ENV: "production",
    },
  });
  runtime.stdout?.on("data", (chunk: Buffer) => logStream?.write(chunk));
  runtime.stderr?.on("data", (chunk: Buffer) => logStream?.write(chunk));

  runtime.on("message", (message: RuntimeToMain) => {
    switch (message.type) {
      case "progress":
        bootScreen(`window.erwinBootStep && window.erwinBootStep(${JSON.stringify(message.step)})`);
        break;
      case "ready":
        // Same origin the runtime gave Next (see runtime.ts): localhost.
        appOrigin = `http://localhost:${message.port}`;
        log(`runtime ready at ${appOrigin}`);
        void signIn();
        break;
      case "failed":
        log(`runtime failed: ${message.message}`);
        void showFailure(message.message);
        break;
      case "stopped":
        break;
    }
  });
  runtime.on("exit", (code) => {
    log(`runtime exited with ${code}`);
    runtime = null;
    if (!quitting && !expectingExit) void showFailure(`Erwin's background process stopped (exit code ${code}).`);
  });

  const locale = new Intl.Locale(app.getLocale());
  const weekInfo = (locale as unknown as { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } });
  const firstDay = weekInfo.getWeekInfo?.().firstDay ?? weekInfo.weekInfo?.firstDay ?? 7;

  const init: MainToRuntime = {
    type: "init",
    dataDir: p.data,
    serverDir: p.server,
    migrationsDir: p.migrations,
    socketDir: p.socketDir,
    port: PREFERRED_PORT,
    secrets: { nextauthSecret: keys.nextauthSecret, erwinSecretKey: keys.erwinSecretKey, bootToken },
    machine: {
      userName: os.userInfo().username,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hourCycle: new Intl.DateTimeFormat(app.getLocale(), { hour: "numeric" }).resolvedOptions().hourCycle ?? "h12",
      firstDay: String(firstDay),
    },
    appVersion: app.getVersion(),
  };
  runtime.postMessage(init);
}

async function restartRuntime(): Promise<void> {
  await stopRuntime();
  appOrigin = null;
  if (mainWindow) await mainWindow.loadFile(BOOT_HTML);
  startRuntime();
}

function stopRuntime(): Promise<void> {
  const child = runtime;
  if (!child) return Promise.resolve();
  expectingExit = true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 4_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.postMessage({ type: "shutdown" } satisfies MainToRuntime);
  });
}

async function signIn(next = "/"): Promise<void> {
  if (!mainWindow || !appOrigin) return;
  const url = new URL("/api/desktop/session", appOrigin);
  url.searchParams.set("t", bootToken);
  url.searchParams.set("next", next);
  await mainWindow.loadURL(url.toString());
}

function navigate(route: string): void {
  if (!mainWindow || !appOrigin) return;
  void mainWindow.loadURL(new URL(route, appOrigin).toString());
}

async function showFailure(message: string): Promise<void> {
  if (!mainWindow) return;
  if (!mainWindow.webContents.getURL().startsWith("file:")) await mainWindow.loadFile(BOOT_HTML);
  bootScreen(`window.erwinBootFailed && window.erwinBootFailed(${JSON.stringify(message.slice(0, 2_000))})`);
}

function bootScreen(script: string): void {
  if (!mainWindow || !mainWindow.webContents.getURL().startsWith("file:")) return;
  mainWindow.webContents.executeJavaScript(script).catch(() => undefined);
}

function isAppUrl(url: string): boolean {
  return !!appOrigin && (url === appOrigin || url.startsWith(`${appOrigin}/`));
}

function log(line: string): void {
  logStream?.write(`[main ${new Date().toISOString()}] ${line}\n`);
}

app.on("before-quit", (event) => {
  if (quitting || !runtime) return;
  event.preventDefault();
  quitting = true;
  void stopRuntime().then(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow) return;
  createWindow();
  if (appOrigin) void signIn();
});
