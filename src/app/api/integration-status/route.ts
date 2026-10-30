import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { appForNewConnection, servesFromLoopback } from "@/lib/oauth/apps";

const LOG_SOURCE = "IntegrationStatusAPI";

export async function GET(request: NextRequest) {
  try {
    // Authenticate the request (any logged in user can access this)
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const [google, outlook] = await Promise.all([
      appForNewConnection("GOOGLE"),
      appForNewConnection("OUTLOOK"),
    ]);

    // Which app a new connection would sign in through, or null when neither
    // Sigwald's own (loopback only) nor a custom one is set up here.
    return NextResponse.json({
      google: { app: google?.kind ?? null },
      outlook: { app: outlook?.kind ?? null },
      // The desktop app: one local user on a loopback server, so Settings
      // leaves out what only a server has (other people's accounts, email).
      desktop: process.env.SIGWALD_RUNTIME === "desktop",
      // Sigwald's own apps can't redirect to a server's own domain, so there
      // the only way in is an app registered under System.
      loopback: servesFromLoopback(),
    });
  } catch (error) {
    logger.error(
      "Failed to fetch integration status",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch integration status" },
      { status: 500 }
    );
  }
}
