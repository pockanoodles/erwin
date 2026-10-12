#!/usr/bin/env node
/**
 * Rewrites the package manifests for one Erwin release.
 *
 *   node scripts/release/update-manifests.mjs <version> <SHA256SUMS.txt> [options]
 *
 * The release workflow writes SHA256SUMS.txt next to the files it attaches to
 * the draft release. This script reads the checksums from it and updates, in
 * place:
 *
 *   packaging/homebrew/erwin.rb              Homebrew cask
 *   packaging/winget/*.yaml                  winget manifests
 *   packaging/aur/erwin-bin/PKGBUILD         AUR package
 *   packaging/aur/erwin-bin/.SRCINFO         derived from the PKGBUILD
 *
 * Options:
 *   --check        Report what is out of date and change nothing. Exit code 1
 *                  if anything is stale or a placeholder is left.
 *   --date <d>     Release date, YYYY-MM-DD. Defaults to today (UTC).
 *   --tap <dir>    Also write the cask to <dir>/Casks/erwin.rb (a checkout of
 *                  the homebrew-tap repo).
 *   --root <dir>   Repo root. Defaults to the repo this script lives in.
 *
 * The AUR checksums for LICENSE and the icon come from the files in the
 * checkout (LICENSE and desktop/build/icon.png), so run this from a checkout of
 * the release tag. The script reads and writes plain text and needs no
 * packages. Node 18 or newer.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const REPO = "https://github.com/pockanoodles/erwin";
const ICON_PATH = "desktop/build/icon.png";

/** Release asset names. They follow artifactName in desktop/electron-builder.yml. */
export function assetNames(version) {
  return {
    macArm64: `Erwin-${version}-mac-arm64.dmg`,
    macX64: `Erwin-${version}-mac-x64.dmg`,
    winX64: `Erwin-${version}-win-x64.exe`,
    linuxX64: `Erwin-${version}-linux-x64.tar.gz`,
    linuxArm64: `Erwin-${version}-linux-arm64.tar.gz`,
  };
}

/** Parses sha256sum output into a Map of file name to lowercase hash. */
export function parseSums(text) {
  const sums = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line);
    if (!match) throw new Error(`Not a sha256sum line: ${line}`);
    sums.set(path.posix.basename(match[2].trim()), match[1].toLowerCase());
  }
  return sums;
}

/** Replaces the first match, and fails loudly if a manifest changed shape. */
function sub(text, regex, replacer, label) {
  let hit = false;
  const out = text.replace(regex, (...args) => {
    hit = true;
    return replacer(...args);
  });
  if (!hit) throw new Error(`${label}: pattern not found: ${regex}`);
  return out;
}

// ---------------------------------------------------------------- cask

function updateCask(text, ctx) {
  let t = sub(text, /^(\s*version\s+)"[^"]*"/m, (_, a) => `${a}"${ctx.version}"`, "cask version");
  t = sub(
    t,
    /sha256 arm:\s*"[^"]*",\s*\n\s*intel:\s*"[^"]*"/,
    () => `sha256 arm:   "${ctx.sums.macArm64}",\n         intel: "${ctx.sums.macX64}"`,
    "cask sha256",
  );
  return t;
}

// -------------------------------------------------------------- winget

const setLine = (text, key, value, label) =>
  sub(text, new RegExp(`^(\\s*${key}:\\s*).*$`, "m"), (_, a) => `${a}${value}`, label);

function updateWingetVersion(text, ctx) {
  return setLine(text, "PackageVersion", `"${ctx.version}"`, "winget PackageVersion");
}

function updateWingetInstaller(text, ctx) {
  const oldVersion = /^PackageVersion:\s*"?([^"\s]+)"?/m.exec(text)?.[1];
  const oldDate = /^ReleaseDate:\s*"?([^"\s]*)"?/m.exec(text)?.[1] ?? "";
  let t = setLine(text, "PackageVersion", `"${ctx.version}"`, "winget PackageVersion");
  // A re-run on the same version keeps its original release date.
  if (oldVersion !== ctx.version || oldDate === "" || oldDate.startsWith("{{")) {
    t = setLine(t, "ReleaseDate", `"${ctx.date}"`, "winget ReleaseDate");
  }
  t = setLine(t, "InstallerUrl", `${REPO}/releases/download/v${ctx.version}/${ctx.assets.winX64}`, "winget InstallerUrl");
  t = setLine(t, "InstallerSha256", `"${ctx.sums.winX64.toUpperCase()}"`, "winget InstallerSha256");
  return t;
}

function updateWingetLocale(text, ctx) {
  let t = setLine(text, "PackageVersion", `"${ctx.version}"`, "winget PackageVersion");
  t = setLine(t, "LicenseUrl", `${REPO}/blob/v${ctx.version}/LICENSE`, "winget LicenseUrl");
  t = setLine(t, "ReleaseNotesUrl", `${REPO}/releases/tag/v${ctx.version}`, "winget ReleaseNotesUrl");
  return t;
}

// ----------------------------------------------------------------- AUR

function updatePkgbuild(text, ctx) {
  const oldVersion = /^pkgver=(.*)$/m.exec(text)?.[1].trim();
  let t = sub(text, /^pkgver=.*$/m, () => `pkgver=${ctx.version}`, "PKGBUILD pkgver");
  if (oldVersion !== ctx.version) t = sub(t, /^pkgrel=.*$/m, () => "pkgrel=1", "PKGBUILD pkgrel");

  // LICENSE and the icon come from the checkout. Without them, keep what is there.
  t = sub(
    t,
    /^sha256sums=\([^)]*\)/m,
    (old) => {
      const current = [...old.matchAll(/'([^']*)'/g)].map((m) => m[1]);
      const license = ctx.localSums.license ?? current[0];
      const icon = ctx.localSums.icon ?? current[1];
      return `sha256sums=('${license}'\n            '${icon}')`;
    },
    "PKGBUILD sha256sums",
  );
  t = sub(t, /^sha256sums_x86_64=\([^)]*\)/m, () => `sha256sums_x86_64=('${ctx.sums.linuxX64}')`, "PKGBUILD sha256sums_x86_64");
  t = sub(t, /^sha256sums_aarch64=\([^)]*\)/m, () => `sha256sums_aarch64=('${ctx.sums.linuxArm64}')`, "PKGBUILD sha256sums_aarch64");
  return t;
}

/**
 * Reads the assignments at the top of a PKGBUILD: quoted strings, bare words
 * and arrays of them, with ${name} expansion. Stops at the first function.
 */
export function parsePkgbuildHeader(text) {
  const vars = new Map();
  const n = text.length;
  const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";

  const expand = (value) =>
    value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      const v = vars.get(name);
      if (typeof v !== "string") throw new Error(`PKGBUILD: \${${name}} is not a plain variable`);
      return v;
    });

  function readWord(i, inArray) {
    const quote = text[i];
    if (quote === "'" || quote === '"') {
      const end = text.indexOf(quote, i + 1);
      if (end === -1) throw new Error("PKGBUILD: unterminated quote");
      const raw = text.slice(i + 1, end);
      return [quote === '"' ? expand(raw) : raw, end + 1];
    }
    let j = i;
    while (j < n && !isSpace(text[j]) && !(inArray && text[j] === ")")) j++;
    return [expand(text.slice(i, j)), j];
  }

  let i = 0;
  while (i < n) {
    while (i < n && isSpace(text[i])) i++;
    if (i >= n) break;
    if (text[i] === "#") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(=|\(\))/.exec(text.slice(i, i + 80));
    if (!m) throw new Error(`PKGBUILD: cannot read near: ${text.slice(i, i + 40)}`);
    if (m[2] === "()") break;
    i += m[0].length;
    if (text[i] === "(") {
      i++;
      const items = [];
      for (;;) {
        while (i < n && isSpace(text[i])) i++;
        if (i >= n) throw new Error(`PKGBUILD: array ${m[1]} is not closed`);
        if (text[i] === ")") {
          i++;
          break;
        }
        const [value, next] = readWord(i, true);
        items.push(value);
        i = next;
      }
      vars.set(m[1], items);
    } else {
      const [value, next] = readWord(i, false);
      vars.set(m[1], value);
      i = next;
    }
  }
  return vars;
}

/** The .SRCINFO that `makepkg --printsrcinfo` prints for this PKGBUILD. */
export function generateSrcinfo(pkgbuild) {
  const v = parsePkgbuildHeader(pkgbuild);
  const list = (key) => (Array.isArray(v.get(key)) ? v.get(key) : []);
  const out = [`pkgbase = ${v.get("pkgname")}`];
  const line = (key, value) => out.push(`\t${key} = ${value}`);

  for (const key of ["pkgdesc", "pkgver", "pkgrel", "url"]) {
    if (typeof v.get(key) === "string") line(key, v.get(key));
  }
  for (const key of ["arch", "license", "depends", "optdepends", "provides", "conflicts", "options", "source", "sha256sums"]) {
    for (const item of list(key)) line(key, item);
  }
  for (const arch of list("arch")) {
    for (const key of ["source", "sha256sums"]) {
      for (const item of list(`${key}_${arch}`)) line(`${key}_${arch}`, item);
    }
  }
  out.push("", `pkgname = ${v.get("pkgname")}`);
  return `${out.join("\n")}\n`;
}

// ---------------------------------------------------------------- main

const sha256File = (file) => (fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null);

function summarize(before, after) {
  const old = new Set(before.split("\n"));
  const changed = after.split("\n").filter((l) => !old.has(l));
  return changed.slice(0, 4).map((l) => `      + ${l.trim().slice(0, 110)}`).join("\n") + (changed.length > 4 ? `\n      ... ${changed.length - 4} more` : "");
}

function usage() {
  return [
    "Usage: node scripts/release/update-manifests.mjs <version> <SHA256SUMS.txt> [--check] [--date YYYY-MM-DD] [--tap <dir>] [--root <dir>]",
    "Rewrites the cask, winget, PKGBUILD and .SRCINFO files for a release. --check only reports.",
  ].join("\n");
}

export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        check: { type: "boolean", default: false },
        date: { type: "string" },
        tap: { type: "string" },
        root: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    console.error(`${error.message}\n${usage()}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(usage());
    return 0;
  }
  if (positionals.length !== 2) {
    console.error(usage());
    return 2;
  }

  const version = positionals[0].replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`Version "${positionals[0]}" is not X.Y.Z. The package channels follow stable releases only.`);
    return 2;
  }
  const date = values.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`Date "${date}" is not YYYY-MM-DD.`);
    return 2;
  }
  const root = path.resolve(values.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));

  let all;
  try {
    all = parseSums(fs.readFileSync(positionals[1], "utf8"));
  } catch (error) {
    console.error(`Cannot read ${positionals[1]}: ${error.message}`);
    return 2;
  }
  const assets = assetNames(version);
  const missing = Object.values(assets).filter((name) => !all.has(name));
  if (missing.length) {
    console.error(`SHA256SUMS.txt has no entry for:\n  ${missing.join("\n  ")}`);
    return 2;
  }
  const sums = Object.fromEntries(Object.entries(assets).map(([key, name]) => [key, all.get(name)]));
  const localSums = { license: sha256File(path.join(root, "LICENSE")), icon: sha256File(path.join(root, ICON_PATH)) };
  const ctx = { version, date, assets, sums, localSums };

  const rel = (...p) => path.join(root, "packaging", ...p);
  const jobs = [
    { file: rel("homebrew", "erwin.rb"), update: updateCask },
    { file: rel("winget", "KaitoSoeno.Erwin.yaml"), update: updateWingetVersion },
    { file: rel("winget", "KaitoSoeno.Erwin.installer.yaml"), update: updateWingetInstaller },
    { file: rel("winget", "KaitoSoeno.Erwin.locale.en-US.yaml"), update: updateWingetLocale },
    { file: rel("aur", "erwin-bin", "PKGBUILD"), update: updatePkgbuild },
  ];

  const results = [];
  try {
    for (const job of jobs) {
      const before = fs.readFileSync(job.file, "utf8");
      results.push({ file: job.file, before, after: job.update(before, ctx) });
    }
    const pkgbuild = results.find((r) => path.basename(r.file) === "PKGBUILD");
    const srcinfoFile = path.join(path.dirname(pkgbuild.file), ".SRCINFO");
    results.push({
      file: srcinfoFile,
      before: fs.existsSync(srcinfoFile) ? fs.readFileSync(srcinfoFile, "utf8") : "",
      after: generateSrcinfo(pkgbuild.after),
    });
    if (values.tap) {
      const cask = results.find((r) => path.basename(r.file) === "erwin.rb");
      const tapFile = path.join(path.resolve(values.tap), "Casks", "erwin.rb");
      results.push({ file: tapFile, before: fs.existsSync(tapFile) ? fs.readFileSync(tapFile, "utf8") : "", after: cask.after });
    }
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  let problems = 0;
  for (const r of results) {
    const name = path.relative(root, r.file) || r.file;
    const stale = r.before !== r.after;
    const left = [...new Set(r.after.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [])];
    if (left.length) problems++;
    if (stale && values.check) problems++;
    const status = stale ? (values.check ? "stale   " : "updated ") : left.length ? "todo    " : "ok      ";
    console.log(`${status} ${name}`);
    if (stale) console.log(summarize(r.before, r.after));
    if (left.length) console.log(`      placeholders left: ${left.join(", ")}`);
    if (stale && !values.check) {
      fs.mkdirSync(path.dirname(r.file), { recursive: true });
      fs.writeFileSync(r.file, r.after);
    }
  }
  if (localSums.license === null) console.log(`note: ${path.join(root, "LICENSE")} not found, so the AUR LICENSE checksum was not checked.`);
  if (localSums.icon === null) console.log(`note: ${path.join(root, ICON_PATH)} not found, so the AUR icon checksum was not checked.`);
  if (problems) {
    console.log(values.check ? `\n${problems} problem(s). Run without --check to update.` : `\n${problems} problem(s) left. See above.`);
    return 1;
  }
  console.log(values.check ? "\nAll manifests match this release." : `\nManifests updated for ${version}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
