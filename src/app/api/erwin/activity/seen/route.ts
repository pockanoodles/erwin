import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinActivitySeenAPI";

const bodySchema = z.union([
  z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }),
  z.object({ all: z.literal(true), courseId: z.string().min(1).optional() }),
  // Opening a material, an announcement, a thread or an assignment marks
  // everything about it seen.
  z.object({
    materialId: z.string().min(1).optional(),
    announcementId: z.string().min(1).optional(),
    conversationId: z.string().min(1).optional(),
    assignmentId: z.string().min(1).optional(),
  }),
]);

/**
 * POST /api/erwin/activity/seen
 *
 * Marks activity seen: `{ ids }`, `{ all: true, courseId? }`, or by what was
 * opened (`{ materialId }`, `{ announcementId }`, `{ conversationId }`,
 * `{ assignmentId }`). Seen is Erwin's own state; nothing is written to Canvas.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "courses");
    if (off) return off;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;
    let target: Record<string, unknown>;
    if ("ids" in body) {
      target = { id: { in: body.ids } };
    } else if ("all" in body) {
      target = body.courseId ? { courseId: body.courseId } : {};
    } else {
      const refs = Object.entries(body).filter(([, v]) => v);
      if (refs.length === 0) {
        return NextResponse.json({ error: "Nothing to mark" }, { status: 400 });
      }
      target = { OR: refs.map(([key, value]) => ({ [key]: value })) };
    }

    const { count } = await prisma.courseActivity.updateMany({
      where: { course: { userId: auth.userId }, seenAt: null, ...target },
      data: { seenAt: new Date() },
    });
    return NextResponse.json({ updated: count });
  } catch (error) {
    logger.error(
      "Erwin activity seen failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to mark activity seen" }, { status: 500 });
  }
}
