import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { isInsideMaterialsRoot } from "@/lib/canvas/material-files";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "SigwaldMaterialFileAPI";

/**
 * GET /api/sigwald/materials/[id]/file
 * Streams a cached course file from local disk, inline (so a PDF opens in the
 * browser). 404 when the file was never downloaded — the material's
 * `downloadError` says why.
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
      where: { id, kind: "FILE", course: { userId: auth.userId } },
      select: { localPath: true, fileName: true, contentType: true },
    });
    if (!material?.localPath || !isInsideMaterialsRoot(material.localPath)) {
      return NextResponse.json({ error: "File not cached" }, { status: 404 });
    }
    const info = await stat(material.localPath).catch(() => null);
    if (!info?.isFile()) {
      return NextResponse.json({ error: "File not cached" }, { status: 404 });
    }
    const name = material.fileName ?? "file";
    return new NextResponse(
      Readable.toWeb(createReadStream(material.localPath)) as ReadableStream,
      {
        headers: {
          "Content-Type": material.contentType ?? "application/octet-stream",
          "Content-Length": String(info.size),
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    logger.error(
      "Sigwald material file failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
