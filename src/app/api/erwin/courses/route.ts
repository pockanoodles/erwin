import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinCoursesAPI";

/**
 * GET /api/erwin/courses
 *
 * The materials library: every mirrored course with its modules and their
 * items in Canvas order, plus description-only materials (moduleId null).
 * Bodies and syllabi are left out to keep the tree light — fetch one via
 * /api/erwin/materials/[id] or /api/erwin/courses/[id]/syllabus.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const materialFields = {
      id: true,
      kind: true,
      title: true,
      position: true,
      indent: true,
      htmlUrl: true,
      locked: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      localPath: true,
      downloadError: true,
      assignmentCanvasId: true,
      moduleId: true,
    } as const;

    const courses = await prisma.course.findMany({
      where: { userId: auth.userId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        canvasId: true,
        code: true,
        name: true,
        termName: true,
        lastSyncedAt: true,
        syllabusHtml: true,
        modules: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            name: true,
            position: true,
            unlockAt: true,
            materials: { orderBy: { position: "asc" }, select: materialFields },
          },
        },
        materials: {
          where: { moduleId: null },
          orderBy: { title: "asc" },
          select: materialFields,
        },
      },
    });

    return NextResponse.json(
      courses.map(({ syllabusHtml, materials, modules, ...course }) => ({
        ...course,
        hasSyllabus: Boolean(syllabusHtml),
        modules: modules.map((m) => ({
          ...m,
          materials: m.materials.map(({ localPath, ...rest }) => ({ ...rest, cached: Boolean(localPath) })),
        })),
        unfiled: materials.map(({ localPath, ...rest }) => ({ ...rest, cached: Boolean(localPath) })),
      }))
    );
  } catch (error) {
    logger.error(
      "Erwin courses list failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load courses" }, { status: 500 });
  }
}
