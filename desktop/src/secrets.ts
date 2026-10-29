/**
 * The two keys a desktop install needs, made on first launch and kept.
 *
 *   nextauthSecret  signs session cookies
 *   sigwaldSecretKey  encrypts stored credentials at rest (Canvas token, CalDAV
 *                   password, OAuth tokens), exactly as on a server install
 *
 * Both are sealed with Electron's safeStorage, which uses the macOS Keychain,
 * Windows DPAPI, or the Linux secret service. Where no secret service exists
 * (some minimal Linux desktops) safeStorage cannot encrypt, so the file is
 * written as plain JSON readable only by this user, and the log says so.
 *
 * A macOS build signed ad hoc keeps that plain file too. The Keychain lets
 * only the build that made its item read it without asking, and an ad-hoc
 * signature names one build: after every update macOS would ask for the login
 * password before Sigwald could start, and Deny would keep it from starting at
 * all. The first signed build seals the file and removes it.
 *
 * Losing this file makes stored credentials unreadable: the app keeps working
 * but every integration has to be connected again. It lives next to the
 * database in the user-data folder, so the two are always backed up together.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { safeStorage } from "electron";

import { isAdhocMacBuild } from "./build";

export interface InstallKeys {
  nextauthSecret: string;
  sigwaldSecretKey: string;
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
    // A secret service, or a signed build, may have appeared since first
    // launch: seal and move.
    if (canSeal()) {
      write(sealedPath, safeStorage.encryptString(JSON.stringify(keys)));
      fs.rmSync(plainPath, { force: true });
    }
    return keys;
  }

  const keys: InstallKeys = {
    nextauthSecret: crypto.randomBytes(32).toString("base64"),
    sigwaldSecretKey: crypto.randomBytes(32).toString("base64"),
  };
  if (canSeal()) {
    write(sealedPath, safeStorage.encryptString(JSON.stringify(keys)));
  } else {
    console.warn("[keys] no OS secret service, or an ad-hoc signed build; storing install keys as a user-only file");
    write(plainPath, JSON.stringify(keys));
  }
  return keys;
}

// The build check comes first: on macOS, asking whether encryption is
// available already reads the Keychain item.
function canSeal(): boolean {
  return !isAdhocMacBuild() && safeStorage.isEncryptionAvailable();
}

function parse(text: string): InstallKeys {
  const value = JSON.parse(text) as Partial<InstallKeys>;
  if (!value.nextauthSecret || !value.sigwaldSecretKey) {
    throw new Error("The install keys file is damaged");
  }
  return { nextauthSecret: value.nextauthSecret, sigwaldSecretKey: value.sigwaldSecretKey };
}

function write(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { mode: 0o600 });
}
