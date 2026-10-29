/**
 * Shared handler for POST /api/sigwald/focus/interaction and /interact (docs/focus-mode.md §2.7).
 */

import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { buildFocusInteractionContext } from "@/lib/sigwald/focus-context";
import { newDate, startOfDay } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(["COMPLETED", "SKIPPED", "SURFACED"]),
  sessionId: z.string().min(1),
  clientTimezone: z.string().optional(),
  context: z.record(z.string(), z.any()).optional(),
});

export async function handleSigwaldFocusInteraction(
  request: NextRequest,
  logSource: string
): Promise<NextResponse> {
  const auth = await authenticateRequest(request, logSource);
  if ("response" in auth) {
    return auth.response as NextResponse;
  }

  const userId = auth.userId;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { taskId, action, sessionId, clientTimezone, context } = parsed.data;
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

  const baseCtx = buildFocusInteractionContext({
    now,
    tasksCompletedToday,
    clientTimezone,
  });

  const mergedCtx = {
    ...baseCtx,
    ...(context ?? {}),
  };

  let interactionId: string | undefined;

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.taskInteraction.create({
        data: {
          taskId,
          action,
          sessionId,
          contextJson: JSON.parse(JSON.stringify(mergedCtx)) as object,
        },
      });
      interactionId = created.id;

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

      if (action === "SURFACED") {
        await tx.task.update({
          where: { id: taskId, userId },
          data: { timesSurfaced: { increment: 1 } },
        });
      }
    });
  } catch (error) {
    logger.error(
      "Sigwald focus interaction transaction failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      logSource
    );
    return NextResponse.json(
      { error: "Failed to record interaction" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, interactionId });
}
