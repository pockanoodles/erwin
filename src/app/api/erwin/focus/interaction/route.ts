import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { buildFocusInteractionContext } from "@/lib/erwin/focus-context";
import { startOfDay, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinFocusInteractionAPI";

const bodySchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(["COMPLETED", "SKIPPED", "SURFACED"]),
  sessionId: z.string().min(1),
  clientTimezone: z.string().optional(),
});

/**
 * POST /api/erwin/focus/interaction
 * Logs TaskInteraction with context snapshot; COMPLETED/SKIPPED update the Task row.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { taskId, action, sessionId, clientTimezone } = parsed.data;
    const now = newDate();

    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const tasksCompletedToday = await prisma.task.count({
      where: {
        userId,
        status: "completed",
        completedAt: {
          gte: startOfDay(now),
        },
      },
    });

    const contextJson = buildFocusInteractionContext({
      now,
      tasksCompletedToday,
      clientTimezone,
    });

    await prisma.$transaction(async (tx) => {
      await tx.taskInteraction.create({
        data: {
          taskId,
          action,
          sessionId,
          contextJson: JSON.parse(JSON.stringify(contextJson)) as object,
        },
      });

      if (action === "COMPLETED") {
        await tx.task.update({
          where: { id: taskId, userId },
          data: {
            status: "completed",
            completedAt: now,
          },
        });
      } else if (action === "SKIPPED") {
        await tx.task.update({
          where: { id: taskId, userId },
          data: {
            skipCount: { increment: 1 },
            lastSkippedAt: now,
          },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error(
      "Erwin focus interaction failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to record interaction" },
      { status: 500 }
    );
  }
}
