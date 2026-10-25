import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { cleanCourseHtml } from "@/lib/canvas/material-html";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinMaterialAPI";

/**
 * GET /api/erwin/materials/[id]
 * One material in full, page body included (sanitized, links re-pointed at
 * the local mirror). A cached file is served by ./file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "courses");
    if (off) return off;
    const { id } = await params;
    const material = await prisma.courseMaterial.findFirst({
      where: { id, course: { userId: auth.userId } },
      include: {
        module: { select: { id: true, name: true } },
        course: { select: { id: true, name: true, code: true, canvasId: true } },
      },
    });
    if (!material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }
    const { localPath, bodyHtml, ...rest } = material;
    return NextResponse.json({
      ...rest,
      bodyHtml: bodyHtml ? await cleanCourseHtml(auth.userId, material.course.canvasId, bodyHtml) : null,
      cached: Boolean(localPath),
    });
  } catch (error) {
    logger.error(
      "Erwin material failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load material" }, { status: 500 });
  }
}
