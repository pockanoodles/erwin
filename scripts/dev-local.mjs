#!/usr/bin/env node
/**
 * Sigwald with nothing installed: no Postgres, no Docker.
 *
 *   npm run dev:local                 → http://localhost:3000, signed in
 *   npm run dev:local -- --port 3100
 *   npm run dev:local -- --seed demo  → first run fills in the example data
 *   npm run dev:local -- --reset      → start from an empty database
 *   npm run dev:local -- --lan        → also reachable from a phone on the
 *                                       same Wi-Fi or tailnet
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
 *
 * Next listens on loopback unless `--lan` is given, because the printed link
 * signs anyone who opens it in as the local admin: on campus or café Wi-Fi the
 * server should not be on the network at all. For the phone, `tailscale serve
 * <port>` is the better road: the server stays on loopback, only the tailnet
 * can reach it, and the phone gets HTTPS.
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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
const lanAccess = flag("lan");
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
    sigwaldSecretKey: crypto.randomBytes(32).toString("base64"),
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
  SIGWALD_SECRET_KEY: keys.sigwaldSecretKey,
  SIGWALD_RUNTIME: "desktop",
  SIGWALD_SCHEDULER: "inprocess",
  SIGWALD_DESKTOP_BOOT_TOKEN: bootToken,
  SIGWALD_DESKTOP_TIME_ZONE: Intl.DateTimeFormat().resolvedOptions().timeZone,
  SIGWALD_DIST_DIR: ".next-local",
  PRISMA_HIDE_UPDATE_MESSAGE: "1",
};

// The CLIs run with this Node, by their files rather than through npx: on
// Windows npx is npx.cmd, which spawn can't start without a shell.
const cli = (pkg, file) => path.join(root, "node_modules", pkg, file);
const node = (script, scriptArgs, overrides = {}) =>
  spawn(process.execPath, [script, ...scriptArgs], { cwd: root, env: { ...env, ...overrides }, stdio: "inherit" });

// Children are awaited, never run synchronously: the database socket lives in
// this process, and a blocked event loop cannot answer it.
function run(script, scriptArgs, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = node(script, scriptArgs, overrides);
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(script)} ${scriptArgs.join(" ")} exited ${code}`))));
  });
}

await run(cli("prisma", "build/index.js"), ["migrate", "deploy"], { DATABASE_URL: dbOrigin });
if (seed && fresh) await run(cli("tsx", "dist/cli.mjs"), ["scripts/demo/seed.ts", seed]);

const hostname = lanAccess ? "0.0.0.0" : "127.0.0.1";
const next = node(cli("next", "dist/bin/next"), ["dev", "--turbopack", "--hostname", hostname, "--port", String(port)]);

function isTailscaleIp(ip) {
  const parts = ip.split(".").map(Number);
  // Tailscale IPv4 addresses sit in 100.64.0.0/10 (100.64.x.x – 100.127.x.x).
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function networkEndpoints() {
  const nets = os.networkInterfaces();
  const tailscale = [];
  const lan = [];
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        const url = `http://${net.address}:${port}`;
        if (isTailscaleIp(net.address)) {
          tailscale.push(url);
        } else {
          lan.push(url);
        }
      }
    }
  }
  return { tailscale, lan };
}

const { tailscale, lan } = lanAccess ? networkEndpoints() : { tailscale: [], lan: [] };
console.log(`\n  Sigwald (local) · database ${path.relative(root, dataDir)}`);
console.log(`  Mac:       ${origin}/api/desktop/session?t=${bootToken}`);
for (const tsUrl of tailscale) {
  console.log(`  Tailscale: ${tsUrl}/api/desktop/session?t=${bootToken}`);
}
for (const lanUrl of lan) {
  console.log(`  Phone:     ${lanUrl}/api/desktop/session?t=${bootToken}`);
}
if (!lanAccess) console.log(`  Phone:     add --lan, or run \`tailscale serve ${port}\``);
console.log("");

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
