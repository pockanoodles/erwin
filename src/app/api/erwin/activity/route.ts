import { NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinActivityAPI";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/**
 * GET /api/erwin/activity
 *
 * What changed in Canvas: new announcements and inbox messages, new or
 * replaced materials, new assignments, moved due dates, posted grades,
 * feedback, work gone missing. Newest first.
 *
 * - `unseen=1` — only what hasn't been opened in Erwin (or read in Canvas).
 * - `since=<ISO time>` — only rows recorded after it, oldest first: a cursor
 *   for a poller (ops pushes these to the hub). Recorded time, not Canvas
 *   time, so a grade posted while sync was down is still after the cursor.
 * - `courseId=<Erwin course id>`, `limit` (default 200, max 500).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const params = request.nextUrl.searchParams;
    const courseId = params.get("courseId");
    const sinceRaw = params.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : null;
    if (since && Number.isNaN(since.getTime())) {
      return NextResponse.json({ error: "since must be an ISO date-time" }, { status: 400 });
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT));

    const scope: Prisma.CourseActivityWhereInput = {
      course: { userId: auth.userId },
      ...(courseId ? { courseId } : {}),
    };
    const [rows, unseenCount] = await Promise.all([
      prisma.courseActivity.findMany({
        where: {
          ...scope,
          ...(params.get("unseen") === "1" ? { seenAt: null } : {}),
          ...(since ? { createdAt: { gt: since } } : {}),
        },
        orderBy: since ? [{ createdAt: "asc" }, { id: "asc" }] : [{ occurredAt: "desc" }, { id: "desc" }],
        take: limit,
        include: {
          course: { select: { id: true, canvasId: true, code: true, name: true } },
          assignment: { select: { htmlUrl: true, taskId: true } },
          material: { select: { htmlUrl: true } },
          announcement: { select: { htmlUrl: true } },
        },
      }),
      prisma.courseActivity.count({ where: { ...scope, seenAt: null } }),
    ]);

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        detail: r.detail,
        occurredAt: r.occurredAt,
        createdAt: r.createdAt,
        seenAt: r.seenAt,
        course: r.course,
        target: {
          materialId: r.materialId,
          assignmentId: r.assignmentId,
          taskId: r.assignment?.taskId ?? null,
          announcementId: r.announcementId,
          conversationId: r.conversationId,
          htmlUrl: r.assignment?.htmlUrl ?? r.material?.htmlUrl ?? r.announcement?.htmlUrl ?? null,
        },
      })),
      unseenCount,
    });
  } catch (error) {
    logger.error(
      "Erwin activity failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
