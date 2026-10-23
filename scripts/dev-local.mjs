#!/usr/bin/env node
/**
 * Erwin with nothing installed: no Postgres, no Docker.
 *
 *   npm run dev:local                 → http://localhost:3000, signed in
 *   npm run dev:local -- --port 3100
 *   npm run dev:local -- --seed demo  → first run fills in the example data
 *   npm run dev:local -- --reset      → start from an empty database
 *
 * The database is PGlite, Postgres compiled to WebAssembly, in `.local/`. It
 * is served over the Postgres wire protocol, so `prisma migrate deploy` and the
 * app's own Prisma client use it exactly as they use Postgres. That is the same
 * arrangement the desktop app runs (desktop/src/runtime.ts), and this mode
 * reuses its single-user sign-in: the link printed below signs you in.
 *
 * Builds go to `.next-local`, so this never touches `.next` (a production
 * build) or `.next-dev` (`npm run dev`). Variables set here win over `.env`,
 * so a developer's real DATABASE_URL is never used.
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const port = Number(option("port", "3000"));
const seed = option("seed", null);
const local = path.join(root, ".local");
const dataDir = path.join(local, "pgdata");

if (flag("reset")) fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(local, { recursive: true });

// Keys for this checkout, made once and kept beside the database.
const keysFile = path.join(local, "keys.json");
if (!fs.existsSync(keysFile)) {
  const keys = {
    nextauthSecret: crypto.randomBytes(32).toString("base64"),
    erwinSecretKey: crypto.randomBytes(32).toString("base64"),
  };
  fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
}
const keys = JSON.parse(fs.readFileSync(keysFile, "utf8"));

const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
const db = await PGlite.create(dataDir);
// One app connection with unnamed statements; see DATABASE_PARAMS in
// desktop/src/runtime.ts for why. Migrations connect separately and first,
// without pgbouncer mode, which Prisma Migrate does not support.
const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 2 });
await server.start();
const dbOrigin = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;
const databaseUrl = `${dbOrigin}&connection_limit=1&pgbouncer=true`;

const bootToken = crypto.randomBytes(24).toString("base64url");
const origin = `http://localhost:${port}`;
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  NEXTAUTH_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
  NEXTAUTH_SECRET: keys.nextauthSecret,
  ERWIN_SECRET_KEY: keys.erwinSecretKey,
  ERWIN_RUNTIME: "desktop",
  ERWIN_SCHEDULER: "inprocess",
  ERWIN_DESKTOP_BOOT_TOKEN: bootToken,
  ERWIN_DESKTOP_TIME_ZONE: Intl.DateTimeFormat().resolvedOptions().timeZone,
  ERWIN_DIST_DIR: ".next-local",
  PRISMA_HIDE_UPDATE_MESSAGE: "1",
};

// Children are awaited, never run synchronously: the database socket lives in
// this process, and a blocked event loop cannot answer it.
function run(cmd, cmdArgs, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, env: { ...env, ...overrides }, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited ${code}`))));
  });
}

await run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: dbOrigin });
if (seed && fresh) await run("npx", ["tsx", "scripts/demo/seed.ts", seed]);

const next = spawn("npx", ["next", "dev", "--turbopack", "--port", String(port)], { cwd: root, env, stdio: "inherit" });

console.log(`\n  Erwin (local) · database ${path.relative(root, dataDir)}`);
console.log(`  Open ${origin}/api/desktop/session?t=${bootToken}\n`);

const stop = async () => {
  next.kill("SIGTERM");
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", (code) => {
  void server.stop().then(() => db.close()).then(() => process.exit(code ?? 0));
});
