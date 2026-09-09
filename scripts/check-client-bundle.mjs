/**
 * Fails the build if server-only code reached the browser bundle.
 *
 * Twice now a server module has been pulled into the client graph by a static
 * import that a runtime `typeof window` check was supposed to guard, and both
 * times the symptom was the entire app rendering as "Application error: a
 * client-side exception has occurred" — because Prisma's browser build throws
 * at module scope. Nothing caught it: `tsc` is happy, the unit suite runs in
 * Node where Prisma is real, and the server still answers 200 because the
 * crash happens during hydration.
 *
 * So the check is on the built artifact, which is the only place the answer is
 * unambiguous. It is a grep rather than a graph walk on purpose: it does not
 * care which import chain is responsible, only whether the code is there.
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const CHUNK_DIR = path.resolve(
  process.cwd(),
  process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  "static/chunks"
);

/** Strings that only appear if a server-only module was bundled. */
const FORBIDDEN = [
  { marker: "PrismaClient", why: "the Prisma client" },
  { marker: "credential-encryption", why: "the credential-encryption extension" },
  { marker: "erwin_v1.", why: "the credential encryption envelope" },
  { marker: "api.resend.com", why: "the Resend SDK" },
  { marker: "Failed to write batch logs", why: "the database-backed ServerLogger" },
];

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.name.endsWith(".js")) found.push(full);
  }
  return found;
}

const files = await walk(CHUNK_DIR);
const violations = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const { marker, why } of FORBIDDEN) {
    if (source.includes(marker)) {
      violations.push({ file: path.relative(process.cwd(), file), marker, why });
    }
  }
}

if (violations.length > 0) {
  console.error(
    `\n✗ Server-only code reached the client bundle (${violations.length} hit(s)):\n`
  );
  for (const v of violations) {
    console.error(`  ${v.file}\n    contains ${v.why} (matched "${v.marker}")`);
  }
  console.error(
    "\nA client component imports it, directly or through a store, a hook, or a\n" +
      "shared lib module. A runtime `typeof window` guard does not help — the\n" +
      "bundler follows the import regardless. Trace the chain from the client\n" +
      "component down, then either make it `import type` or move the server half\n" +
      "behind an API route. See src/lib/logger/server.browser.ts for the pattern\n" +
      "used when the import genuinely has to stay universal.\n"
  );
  process.exit(1);
}

console.log(`✓ client bundle clean (${files.length} chunks checked)`);
