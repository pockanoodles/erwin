import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

import { isModuleId, moduleById } from "@/modules";
import { updateModule } from "@/modules/state";
import type { ModuleListing } from "@/modules/types";

const LOG_SOURCE = "ModulesAPI";

/**
 * PATCH /api/modules/:id  { on?: boolean, position?: number }
 *
 * Turns a module on or off for this person, or moves it in the rail. Off
 * hides it and pauses its work; nothing it stored is deleted. Answers with
 * the whole list, the same shape as GET /api/modules.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const { id } = await params;
    if (!isModuleId(id)) {
      return NextResponse.json(
        { error: `No module called ${id}` },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      on?: unknown;
      position?: unknown;
    } | null;
    const on = body?.on;
    const position = body?.position;
    if (
      (on !== undefined && typeof on !== "boolean") ||
      (position !== undefined &&
        !(Number.isInteger(position) && (position as number) >= 0)) ||
      (on === undefined && position === undefined)
    ) {
      return NextResponse.json(
        {
          error:
            "Send on (true or false), position (a whole number from 0), or both",
        },
        { status: 400 }
      );
    }

    const states = await updateModule(auth.userId, id, {
      on: on as boolean | undefined,
      position: position as number | undefined,
    });
    logger.info(
      "Module changed",
      { module: id, on: String(on), position: String(position) },
      LOG_SOURCE
    );

    const modules: ModuleListing[] = states.map((s) => ({
      ...moduleById(s.id),
      on: s.on,
      position: s.position,
    }));
    return NextResponse.json({ modules });
  } catch (error) {
    logger.error(
      "Failed to change module",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to change module" },
      { status: 500 }
    );
  }
}
