import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

import { moduleById } from "@/modules";
import { loadModuleStates } from "@/modules/state";
import type { ModuleListing } from "@/modules/types";

const LOG_SOURCE = "ModulesAPI";

/**
 * GET /api/modules
 *
 * Every module this build ships, with whether this person has it on and where
 * it sits in the rail, in rail order. The catalog and the rail both read it.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const states = await loadModuleStates(auth.userId);
    const modules: ModuleListing[] = states.map((s) => ({
      ...moduleById(s.id),
      on: s.on,
      position: s.position,
    }));
    return NextResponse.json({ modules });
  } catch (error) {
    logger.error(
      "Failed to list modules",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to list modules" },
      { status: 500 }
    );
  }
}
