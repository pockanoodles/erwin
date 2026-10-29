import fs from "node:fs";
import path from "node:path";

import { app } from "electron";

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

/**
 * A macOS build signed ad hoc (release.yml without the Apple secrets). Its
 * signature names only that one build, so nothing that checks the signature
 * across versions works for it: Squirrel.Mac's updates (updater.ts) and the
 * Keychain item that holds the install keys (secrets.ts).
 */
export function isAdhocMacBuild(): boolean {
  return process.platform === "darwin" && buildKind() === "adhoc";
}
