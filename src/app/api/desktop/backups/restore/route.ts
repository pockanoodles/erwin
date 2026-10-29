import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { desktopBackups } from "@/lib/desktop/backups";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "DesktopBackupsRestoreAPI";

export const dynamic = "force-dynamic";

/**
 * Restores one backup: `{ name }` from the list. The desktop app restarts into
 * it a moment after this answers, and keeps the database it replaces.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const backups = desktopBackups();
  if (!backups) {
    return NextResponse.json(
      { error: "Backups are made by the desktop app" },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  if (!backups.list().some((backup) => backup.name === name)) {
    return NextResponse.json({ error: "No such backup" }, { status: 404 });
  }

  try {
    backups.restore(name);
    logger.info("Restoring a backup", { name }, LOG_SOURCE);
    return NextResponse.json({ restarting: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Restore failed", { error: message }, LOG_SOURCE);
    return NextResponse.json({ error: "The restore failed" }, { status: 500 });
  }
}
