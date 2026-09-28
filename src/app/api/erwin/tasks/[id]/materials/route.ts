import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { cleanCourseHtml } from "@/lib/canvas/material-html";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinTaskMaterialsAPI";

// Linked from the description first (the instructor pointed at it), then by module order.
const REASON_ORDER: Record<string, number> = { DESCRIPTION: 0, MODULE: 1 };

/**
 * GET /api/erwin/tasks/[id]/materials
 *
 * A task's packet: its instructions (Canvas description, sanitized and with
 * links re-pointed at the local mirror), rubric, Canvas link, and linked
 * materials with why each is linked. The one read both Focus and the Tasks
 * packet pane use.
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
    const task = await prisma.task.findFirst({
      where: { id, userId: auth.userId },
      select: {
        id: true,
        title: true,
        description: true,
        rubric: true,
        externalUrl: true,
        source: true,
        dueDate: true,
        pointsPossible: true,
        gradeWeightPercent: true,
        submissionStatus: true,
        courseId: true,
        courseName: true,
        materialLinks: {
          select: {
            reason: true,
            material: {
              select: {
                id: true,
                kind: true,
                title: true,
                position: true,
                htmlUrl: true,
                locked: true,
                fileName: true,
                contentType: true,
                sizeBytes: true,
                localPath: true,
                downloadError: true,
                module: { select: { name: true, position: true } },
              },
            },
          },
        },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { materialLinks, description, ...rest } = task;
    const materials = materialLinks
      .map(({ reason, material: { localPath, ...m } }) => ({ ...m, reason, cached: Boolean(localPath) }))
      .sort(
        (a, b) =>
          (REASON_ORDER[a.reason] ?? 9) - (REASON_ORDER[b.reason] ?? 9) ||
          (a.module?.position ?? 0) - (b.module?.position ?? 0) ||
          (a.position ?? 0) - (b.position ?? 0)
      );

    // Only Canvas descriptions are HTML; a hand-made task's notes are text
    // and the packet doesn't show them.
    const instructionsHtml =
      task.source === "CANVAS" ? await cleanCourseHtml(auth.userId, task.courseId, description) : null;

    return NextResponse.json({ ...rest, instructionsHtml, materials });
  } catch (error) {
    logger.error(
      "Erwin task materials failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load task materials" }, { status: 500 });
  }
}
