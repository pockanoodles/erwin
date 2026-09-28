import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinMaterialAPI";

/**
 * GET /api/erwin/materials/[id]
 * One material in full, page body included (raw Canvas HTML — sanitize before
 * rendering). A cached file is served by ./file.
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
    const { id } = await params;
    const material = await prisma.courseMaterial.findFirst({
      where: { id, course: { userId: auth.userId } },
      include: {
        module: { select: { id: true, name: true } },
        course: { select: { id: true, name: true, code: true } },
      },
    });
    if (!material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }
    const { localPath, ...rest } = material;
    return NextResponse.json({ ...rest, cached: Boolean(localPath) });
  } catch (error) {
    logger.error(
      "Erwin material failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load material" }, { status: 500 });
  }
}
