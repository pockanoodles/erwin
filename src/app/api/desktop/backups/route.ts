import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { desktopBackups } from "@/lib/desktop/backups";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "DesktopBackupsAPI";

export const dynamic = "force-dynamic";

/** The desktop app's backups, newest first. `available: false` elsewhere. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const backups = desktopBackups();
  if (!backups) return NextResponse.json({ available: false });
  return NextResponse.json({
    available: true,
    dir: backups.dir,
    backups: backups.list(),
  });
}

/** Backs up now. */
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
  try {
    const backup = await backups.create();
    return NextResponse.json({ backup, backups: backups.list() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Backup failed", { error: message }, LOG_SOURCE);
    return NextResponse.json({ error: "The backup failed" }, { status: 500 });
  }
}
