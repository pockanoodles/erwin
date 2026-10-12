#!/usr/bin/env node
/**
 * Builds Erwin's server for the desktop app and stages it for electron-builder.
 *
 *   npm run build:desktop        → desktop/.stage/{server,migrations}
 *
 * The build goes to `.next-desktop`, never `.next`: `.next` is what a running
 * `next start` serves, and overwriting it under a live server breaks the pages
 * it has already handed out.
 *
 * Nothing from a developer's `.env` may ship. Next loads `.env` during every
 * build, so the public variables are pinned here (an empty value in the
 * environment wins over the file), the database URL points nowhere so a build
 * that tried to read data fails instead of reading someone's real database,
 * and the staged output is scanned for every `.env` value before it is used.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const distDir = ".next-desktop";
const stage = path.join(root, "desktop", ".stage");

function run(cmd, args, env) {
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
}

const buildEnv = {
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  ERWIN_STANDALONE: "1",
  ERWIN_DIST_DIR: distDir,
  NEXT_PUBLIC_ENABLE_SAAS_FEATURES: "false",
  NEXT_PUBLIC_APP_URL: "",
  NEXT_PUBLIC_SITE_URL: "",
  DATABASE_URL: "postgresql://build:build@127.0.0.1:1/no_database_at_build_time",
};

if (!process.argv.includes("--skip-build")) {
  run("npx", ["prisma", "generate"], buildEnv);
  run("npx", ["next", "build"], buildEnv);
  run("node", ["scripts/check-client-bundle.mjs"], buildEnv);
}

const standalone = path.join(root, distDir, "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error(`No standalone server at ${standalone}. Did the build run with ERWIN_STANDALONE=1?`);
}

fs.rmSync(stage, { recursive: true, force: true });
const server = path.join(stage, "server");
fs.cpSync(standalone, server, { recursive: true, verbatimSymlinks: true });
fs.cpSync(path.join(root, distDir, "static"), path.join(server, distDir, "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(server, "public"), { recursive: true });
fs.cpSync(path.join(root, "prisma", "migrations"), path.join(stage, "migrations"), { recursive: true });

// The generated Prisma client and its query engine. Tracing usually brings
// them, but the Docker image has always copied them explicitly too, for the
// same reason: a missing engine is a crash on first query, not a build error.
// Only the engines this platform's packages load: schema.prisma lists every
// target, and each one is 15 to 20 MB. The macOS job packs both arches, so it
// keeps both; a Linux job keeps the glibc engines for its own arch.
const keepEngine = {
  darwin: (f) => f.includes("-darwin"),
  linux: (f) => (process.arch === "arm64" ? f.includes("linux-arm64") : /debian|rhel/.test(f)),
  win32: (f) => f.includes("windows"),
}[process.platform] ?? (() => true);
fs.cpSync(path.join(root, "node_modules", ".prisma", "client"), path.join(server, "node_modules", ".prisma", "client"), {
  recursive: true,
  filter: (src) => !/query_engine/.test(path.basename(src)) || keepEngine(path.basename(src)),
});
// Tracing may have copied engines on its own; hold it to the same rule.
for (const file of walk(path.join(server, "node_modules"))) {
  const name = path.basename(file);
  if (/query_engine/.test(name) && !keepEngine(name)) fs.rmSync(file);
}

// No env files in the app, ever.
for (const file of walk(stage)) {
  if (/^\.env(\..*)?$/.test(path.basename(file))) fs.rmSync(file);
}

// And no value from the developer's .env anywhere in the staged files.
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  const secrets = fs
    .readFileSync(envFile, "utf8")
    .split("\n")
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => ({ key, value: value.trim() }))
    .filter(({ value }) => value.length >= 12 && !/^https?:\/\/localhost/.test(value));
  const leaks = [];
  for (const file of walk(stage)) {
    if (fs.statSync(file).size > 50 * 1024 * 1024) continue;
    const text = fs.readFileSync(file, "latin1");
    for (const { key, value } of secrets) if (text.includes(value)) leaks.push(`${key} in ${path.relative(stage, file)}`);
  }
  if (leaks.length) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw new Error(`Refusing to stage: .env values found in the build output:\n  ${leaks.join("\n  ")}`);
  }
}

const engines = fs.readdirSync(path.join(server, "node_modules", ".prisma", "client")).filter((f) => f.includes("query_engine"));
console.log(`\nStaged ${path.relative(root, stage)}: server, ${fs.readdirSync(path.join(stage, "migrations")).length - 1} migrations, engines: ${engines.join(", ")}`);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}
