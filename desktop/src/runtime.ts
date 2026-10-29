/**
 * The runtime process: Sigwald's own server, inside the desktop app.
 *
 * Runs in an Electron utility process (plain Node, no window). On `init` it:
 *   1. opens the database: PGlite, which is Postgres compiled to WebAssembly,
 *      stored in the app's user-data folder. No native database binaries ship
 *      with the app, so it runs the same in the Mac App Store sandbox, a
 *      snap and a Windows Store package;
 *   2. applies prisma/migrations in order, the way `prisma migrate deploy`
 *      would, recording each in `_prisma_migrations`, and saves a copy of the
 *      database first whenever a migration is about to change it;
 *   3. serves that database over the Postgres wire protocol (a Unix socket on
 *      macOS and Linux, loopback TCP on Windows), so the Next server's Prisma
 *      client talks to it exactly as it talks to Postgres on a server install.
 *      Same queries, same credential encryption, no second data layer;
 *   4. starts the Next standalone server on 127.0.0.1 and reports the port.
 *
 * It also keeps the backups: a copy before any migration that changes the
 * database, one a day while the app runs, and one whenever the person asks.
 * The Next server reaches them through `globalThis.sigwaldDesktopBackups`
 * (src/lib/desktop-backups.ts). A restore is a restart: the runtime marks the
 * copy, asks the main process to restart it, and the next start loads that
 * copy in place of the database, keeping the one it replaces beside it.
 *
 * On `shutdown` it closes the socket and the database cleanly before exiting,
 * so a quit never leaves the data directory mid-write.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import type { PGlite } from "@electric-sql/pglite";

import type { MainToRuntime, RuntimeInit, RuntimeToMain } from "./protocol";

interface ParentPort {
  on(event: "message", listener: (event: { data: MainToRuntime }) => void): void;
  postMessage(message: RuntimeToMain): void;
}

const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

/**
 * One connection, unnamed statements. pglite-socket funnels every client into
 * PGlite's single session and keeps explicit transactions whole, but between
 * transactions it interleaves clients message by message, so two concurrent
 * connections could cross a Parse with another's Bind. The server is the only
 * client, so one Prisma connection costs nothing, and `pgbouncer=true` makes
 * Prisma use unnamed statements, which never collide with statement names a
 * previous connection left in the shared session. The socket allows a second
 * connection only so a reconnect can overlap the old one closing.
 */
const DATABASE_PARAMS = "connection_limit=1&pgbouncer=true";
const SOCKET_MAX_CONNECTIONS = 2;

/** How many backups of each kind are kept; the oldest go first. */
const BACKUPS_KEPT = { before: 5, daily: 14, manual: 10 } as const;
type BackupKind = keyof typeof BACKUPS_KEPT;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Written by a restore request, read and removed by the next start. */
const RESTORE_MARKER = "restore-pending.json";
/** Databases a restore replaced, kept beside the live one. */
const REPLACED_KEPT = 2;

/** One file in the backups folder, as the Settings page lists it. */
interface BackupFile {
  name: string;
  kind: BackupKind;
  createdAt: string;
  bytes: number;
}

let db: PGlite | null = null;
let dbServer: { stop(): Promise<void> } | null = null;
let stopping = false;

function send(message: RuntimeToMain): void {
  parentPort.postMessage(message);
}

parentPort.on("message", ({ data }) => {
  if (data.type === "init") {
    start(data).catch((error: unknown) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error("[runtime] start failed", message);
      send({ type: "failed", message });
    });
  } else if (data.type === "shutdown") {
    void stop();
  }
});

process.on("uncaughtException", (error) => {
  console.error("[runtime] uncaught", error);
  send({ type: "failed", message: error.stack ?? error.message });
});

async function start(init: RuntimeInit): Promise<void> {
  send({ type: "progress", step: "database" });
  const { PGlite } = await import("@electric-sql/pglite");
  const backupsDir = path.join(path.dirname(init.dataDir), "backups");
  db = await restorePending(init.dataDir, backupsDir);
  if (!db) {
    fs.mkdirSync(init.dataDir, { recursive: true });
    db = await PGlite.create(init.dataDir);
  }

  send({ type: "progress", step: "migrations" });
  await migrate(db, init.migrationsDir, backupsDir);

  const databaseUrl = await serveDatabase(db, init.socketDir);
  const port = await choosePort(init.port);
  // The server binds 127.0.0.1 only, but the origin is `localhost`: Next's
  // standalone server builds every redirect on localhost whatever HOSTNAME
  // says, and a cookie set on 127.0.0.1 would not follow it there.
  const origin = `http://localhost:${port}`;

  // The Next server reads its configuration from the environment. Nothing
  // here was in the spawn environment; it all arrived over the parent port.
  Object.assign(process.env, {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    NEXTAUTH_URL: origin,
    NEXT_PUBLIC_APP_URL: origin,
    NEXTAUTH_SECRET: init.secrets.nextauthSecret,
    SIGWALD_SECRET_KEY: init.secrets.sigwaldSecretKey,
    SIGWALD_DESKTOP_BOOT_TOKEN: init.secrets.bootToken,
    SIGWALD_RUNTIME: "desktop",
    SIGWALD_SCHEDULER: "inprocess",
    SIGWALD_DESKTOP_VERSION: init.appVersion,
    SIGWALD_DESKTOP_USER_NAME: init.machine.userName,
    SIGWALD_DESKTOP_TIME_ZONE: init.machine.timeZone,
    SIGWALD_DESKTOP_HOUR_CYCLE: init.machine.hourCycle,
    SIGWALD_DESKTOP_FIRST_DAY: init.machine.firstDay,
  });

  const database = db;
  (globalThis as { sigwaldDesktopBackups?: unknown }).sigwaldDesktopBackups = {
    dir: backupsDir,
    list: () => listBackups(backupsDir),
    create: () => snapshot(database, backupsDir, "manual", "manual"),
    restore: (name: string) => requestRestore(path.dirname(init.dataDir), backupsDir, name),
  };

  send({ type: "progress", step: "server" });
  // server.js is Next's standalone entry: it chdirs to its own folder and
  // listens on HOSTNAME:PORT.
  require(path.join(init.serverDir, "server.js"));
  await waitForServer(port, 90_000);
  send({ type: "ready", port });
  scheduleDailyBackups(database, backupsDir);
}

async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    await dbServer?.stop();
    await db?.close();
  } catch (error) {
    console.error("[runtime] stop", error);
  }
  send({ type: "stopped" });
  process.exit(0);
}

// ── Migrations ───────────────────────────────────────────────────────────

async function migrate(database: PGlite, migrationsDir: string, backupsDir: string): Promise<void> {
  await database.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )`);

  const applied = new Set(
    (
      await database.query<{ migration_name: string }>(
        `SELECT migration_name FROM "_prisma_migrations"
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
      )
    ).rows.map((row) => row.migration_name)
  );

  const pending = fs
    .readdirSync(migrationsDir)
    .filter((name) => fs.existsSync(path.join(migrationsDir, name, "migration.sql")))
    .sort()
    .filter((name) => !applied.has(name));

  if (pending.length === 0) return;

  // An update that changes the schema gets a copy of the database first. A
  // fresh install has nothing to lose, so it skips this.
  if (applied.size > 0) {
    await backup(database, backupsDir, pending[0]);
  }

  for (const name of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    await database.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), now(), 1)`,
        [crypto.randomUUID(), checksum, name]
      );
    });
    console.log(`[runtime] applied migration ${name}`);
  }
}

async function backup(database: PGlite, backupsDir: string, before: string): Promise<void> {
  await snapshot(database, backupsDir, "before", `before-${before}`);
}

// ── Backups ─────────────────────────────────────────────────────────────

/**
 * Writes a gzipped copy of the data folder, then keeps the newest of its kind.
 * dumpDataDir copies the folder file by file and takes no lock of its own,
 * so while the server runs, the copy holds the query lock, after a checkpoint
 * that puts committed work in the data files. It is written under a temporary
 * name and renamed, so a half-written copy never lists as a backup.
 */
async function snapshot(database: PGlite, backupsDir: string, kind: BackupKind, label: string): Promise<BackupFile> {
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `sigwald-${stamp}-${label}.tar.gz`;
  const file = path.join(backupsDir, name);
  await database.exec("CHECKPOINT");
  const dump = await database.runExclusive(() => database.dumpDataDir("gzip"));
  const bytes = Buffer.from(await dump.arrayBuffer());
  fs.writeFileSync(`${file}.partial`, bytes);
  fs.renameSync(`${file}.partial`, file);
  console.log(`[runtime] saved ${file}`);

  for (const old of listBackups(backupsDir).filter((b) => b.kind === kind).slice(BACKUPS_KEPT[kind])) {
    fs.rmSync(path.join(backupsDir, old.name), { force: true });
  }
  return { name, kind, createdAt: new Date().toISOString(), bytes: bytes.length };
}

/** Every backup, newest first. */
function listBackups(backupsDir: string): BackupFile[] {
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir)
    .filter((name) => name.startsWith("sigwald-") && name.endsWith(".tar.gz"))
    .sort()
    .reverse()
    .map((name) => {
      const stat = fs.statSync(path.join(backupsDir, name));
      const kind: BackupKind = name.includes("-before-") ? "before" : name.endsWith("-daily.tar.gz") ? "daily" : "manual";
      return { name, kind, createdAt: stat.mtime.toISOString(), bytes: stat.size };
    });
}

/**
 * One copy a day while the app is open: a few minutes after it starts if the
 * last daily copy is a day old, then checked every hour.
 */
function scheduleDailyBackups(database: PGlite, backupsDir: string): void {
  const tick = async () => {
    if (stopping) return;
    const newest = listBackups(backupsDir).find((b) => b.kind === "daily");
    if (newest && Date.now() - Date.parse(newest.createdAt) < DAY_MS - 60 * 60 * 1000) return;
    try {
      await snapshot(database, backupsDir, "daily", "daily");
    } catch (error) {
      console.error("[runtime] daily backup failed", error);
    }
  };
  setTimeout(() => void tick(), 3 * 60 * 1000).unref();
  setInterval(() => void tick(), 60 * 60 * 1000).unref();
}

/**
 * Marks a backup to load on the next start and asks the main process for that
 * restart. The name must be one the backups folder lists, so nothing outside
 * it can be loaded. The answer goes out before the restart does.
 */
function requestRestore(userData: string, backupsDir: string, name: string): void {
  if (!listBackups(backupsDir).some((b) => b.name === name)) {
    throw new Error(`No backup named ${name}`);
  }
  fs.writeFileSync(path.join(userData, RESTORE_MARKER), JSON.stringify({ name }));
  setTimeout(() => send({ type: "restart" }), 500);
}

/**
 * Loads a marked backup in place of the database, before anything opens it.
 * The database it replaces moves aside as `database-replaced-<time>` (the
 * newest two are kept), so a restore never loses what was there. The marker
 * goes first: a copy that can't load puts the old database back and is not
 * tried again.
 */
async function restorePending(dataDir: string, backupsDir: string): Promise<PGlite | null> {
  const marker = path.join(path.dirname(dataDir), RESTORE_MARKER);
  if (!fs.existsSync(marker)) return null;
  let name: string;
  try {
    name = path.basename(String((JSON.parse(fs.readFileSync(marker, "utf8")) as { name?: unknown }).name ?? ""));
  } finally {
    fs.rmSync(marker, { force: true });
  }
  const file = path.join(backupsDir, name);
  if (!name || !fs.existsSync(file)) {
    console.error(`[runtime] restore skipped: no backup ${name}`);
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const aside = `${dataDir}-replaced-${stamp}`;
  if (fs.existsSync(dataDir)) fs.renameSync(dataDir, aside);
  try {
    const { PGlite } = await import("@electric-sql/pglite");
    const database = await PGlite.create(dataDir, { loadDataDir: new Blob([fs.readFileSync(file)]) });
    console.log(`[runtime] restored ${name}; the database it replaced is ${aside}`);
    const replaced = fs
      .readdirSync(path.dirname(dataDir))
      .filter((entry) => entry.startsWith(`${path.basename(dataDir)}-replaced-`))
      .sort()
      .reverse()
      .slice(REPLACED_KEPT);
    for (const entry of replaced) fs.rmSync(path.join(path.dirname(dataDir), entry), { recursive: true, force: true });
    return database;
  } catch (error) {
    console.error(`[runtime] restore of ${name} failed, keeping the database as it was`, error);
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (fs.existsSync(aside)) fs.renameSync(aside, dataDir);
    return null;
  }
}

// ── Database socket ─────────────────────────────────────────────────────

async function serveDatabase(database: PGlite, socketDir: string | null): Promise<string> {
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const params = DATABASE_PARAMS;

  // A Unix socket in the app's own folder is readable only by this user. The
  // file name follows libpq's convention, which is how Prisma finds it.
  if (socketDir) {
    fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 });
    const socketPath = path.join(socketDir, ".s.PGSQL.5432");
    fs.rmSync(socketPath, { force: true });
    const server = new PGLiteSocketServer({ db: database, path: socketPath, maxConnections: SOCKET_MAX_CONNECTIONS });
    await server.start();
    dbServer = server;
    return `postgresql://postgres:postgres@localhost:5432/postgres?host=${encodeURIComponent(socketDir)}&${params}`;
  }

  const server = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 0, maxConnections: SOCKET_MAX_CONNECTIONS });
  await server.start();
  dbServer = server;
  return `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable&${params}`;
}

// ── Server ──────────────────────────────────────────────────────────────

/** The preferred port keeps OAuth redirect URIs stable; a busy one falls back to any free port. */
function choosePort(preferred: number): Promise<number> {
  const listen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", reject);
      probe.listen(port, "127.0.0.1", () => {
        const address = probe.address();
        const chosen = typeof address === "object" && address ? address.port : port;
        probe.close(() => resolve(chosen));
      });
    });
  return listen(preferred).catch(() => listen(0));
}

function waitForServer(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get({ host: "127.0.0.1", port, path: "/api/setup/check", timeout: 2_000 }, (response) => {
        response.resume();
        if ((response.statusCode ?? 500) < 500) return resolve();
        retry();
      });
      request.on("error", retry);
      request.on("timeout", () => request.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`The server did not answer on port ${port}`));
      setTimeout(attempt, 150);
    };
    attempt();
  });
}
