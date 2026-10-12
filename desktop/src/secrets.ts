/**
 * The two keys a desktop install needs, made on first launch and kept.
 *
 *   nextauthSecret  signs session cookies
 *   erwinSecretKey  encrypts stored credentials at rest (Canvas token, CalDAV
 *                   password, OAuth tokens), exactly as on a server install
 *
 * Both are sealed with Electron's safeStorage, which uses the macOS Keychain,
 * Windows DPAPI, or the Linux secret service. Where no secret service exists
 * (some minimal Linux desktops) safeStorage cannot encrypt, so the file is
 * written as plain JSON readable only by this user, and the log says so.
 *
 * Losing this file makes stored credentials unreadable: the app keeps working
 * but every integration has to be connected again. It lives next to the
 * database in the user-data folder, so the two are always backed up together.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { safeStorage } from "electron";

export interface InstallKeys {
  nextauthSecret: string;
  erwinSecretKey: string;
}

const SEALED = "keys.bin";
const PLAIN = "keys.json";

export function loadInstallKeys(userData: string): InstallKeys {
  const sealedPath = path.join(userData, SEALED);
  const plainPath = path.join(userData, PLAIN);

  if (fs.existsSync(sealedPath)) {
    return parse(safeStorage.decryptString(fs.readFileSync(sealedPath)));
  }
  if (fs.existsSync(plainPath)) {
    const keys = parse(fs.readFileSync(plainPath, "utf8"));
    // A secret service may have appeared since first launch: seal and move.
    if (safeStorage.isEncryptionAvailable()) {
      write(sealedPath, safeStorage.encryptString(JSON.stringify(keys)));
      fs.rmSync(plainPath, { force: true });
    }
    return keys;
  }

  const keys: InstallKeys = {
    nextauthSecret: crypto.randomBytes(32).toString("base64"),
    erwinSecretKey: crypto.randomBytes(32).toString("base64"),
  };
  if (safeStorage.isEncryptionAvailable()) {
    write(sealedPath, safeStorage.encryptString(JSON.stringify(keys)));
  } else {
    console.warn("[keys] no OS secret service; storing install keys as a user-only file");
    write(plainPath, JSON.stringify(keys));
  }
  return keys;
}

function parse(text: string): InstallKeys {
  const value = JSON.parse(text) as Partial<InstallKeys>;
  if (!value.nextauthSecret || !value.erwinSecretKey) {
    throw new Error("The install keys file is damaged");
  }
  return { nextauthSecret: value.nextauthSecret, erwinSecretKey: value.erwinSecretKey };
}

function write(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { mode: 0o600 });
}
