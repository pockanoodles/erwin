/**
 * First run of the desktop app: the one local user.
 *
 * A desktop install has exactly one person in it, so there is no sign-up
 * form and no password. The Electron shell signs that person in through
 * `/api/desktop/session` with a token only it knows. This module makes sure
 * the user exists and carries the machine's own time zone, clock and week
 * start instead of the server defaults.
 *
 * The user is created by the same `/api/setup` handler a server install runs,
 * called in-process, so both kinds of install get identical default settings
 * and the fork keeps a single first-user code path to port upstream fixes
 * into. The random password it is given is cleared straight after: the
 * desktop user has no password, and credentials sign-in rejects a null hash.
 */

import { randomBytes } from "node:crypto";

import { POST as runFirstUserSetup } from "@/app/api/setup/route";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "DesktopBootstrap";

/** `.invalid` is reserved (RFC 2606): this address can never receive mail. */
export const DESKTOP_USER_EMAIL = "local@erwin.invalid";

export async function ensureDesktopUser() {
  const existing =
    (await prisma.user.findFirst({ where: { role: "admin" } })) ??
    (await prisma.user.findFirst());
  if (existing) {
    return existing;
  }

  const response = await runFirstUserSetup(
    new Request("http://127.0.0.1/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: process.env.ERWIN_DESKTOP_USER_NAME || "You",
        email: DESKTOP_USER_EMAIL,
        password: randomBytes(32).toString("base64url"),
      }),
    })
  );
  if (!response.ok) {
    throw new Error(`Desktop first-run setup failed (${response.status})`);
  }

  const user = await prisma.user.update({
    where: { email: DESKTOP_USER_EMAIL },
    data: { passwordHash: null },
  });
  await applyMachineDefaults(user.id);
  logger.info("Created the desktop user", { userId: user.id }, LOG_SOURCE);
  return user;
}

/**
 * The shell reads these from the OS (`Intl` in the Electron main process) and
 * passes them in, because the server's defaults (New York, 12-hour, Sunday)
 * are only right for some of the people who download the app.
 */
async function applyMachineDefaults(userId: string): Promise<void> {
  const timeZone = process.env.ERWIN_DESKTOP_TIME_ZONE;
  const hourCycle = process.env.ERWIN_DESKTOP_HOUR_CYCLE;
  const firstDay = process.env.ERWIN_DESKTOP_FIRST_DAY;

  await prisma.userSettings.update({
    where: { userId },
    data: {
      ...(timeZone ? { timeZone } : {}),
      ...(hourCycle
        ? { timeFormat: hourCycle === "h23" || hourCycle === "h24" ? "24h" : "12h" }
        : {}),
      ...(firstDay ? { weekStartDay: firstDay === "1" ? "monday" : "sunday" } : {}),
    },
  });
}
