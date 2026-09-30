import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinTaskLinksAPI";

/**
 * POST /api/erwin/task-links
 * Links a task to a goal (many-to-many — a task can serve several goals).
 * Idempotent: re-posting an existing link returns it unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const { taskId, goalId } = await request.json();
    if (!taskId || !goalId) {
      return new NextResponse("taskId and goalId are required", {
        status: 400,
      });
    }

    const [task, goal] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId, userId } }),
      prisma.goal.findUnique({ where: { id: goalId, userId } }),
    ]);
    if (!task) {
      return new NextResponse("Task not found", { status: 404 });
    }
    if (!goal) {
      return new NextResponse("Goal not found", { status: 404 });
    }

    // A hand-made link pins the task: the vault's goal rules leave it alone.
    const [link] = await prisma.$transaction([
      prisma.taskGoalLink.upsert({
        where: { taskId_goalId: { taskId, goalId } },
        create: { taskId, goalId },
        update: {},
      }),
      prisma.task.update({ where: { id: taskId }, data: { goalsPinned: true } }),
    ]);

    return NextResponse.json(link);
  } catch (error) {
    logger.error(
      "Error creating task link:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/**
 * DELETE /api/erwin/task-links?taskId=…&goalId=…
 * Unlinks a task from one goal; other links are untouched.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    const goalId = searchParams.get("goalId");
    if (!taskId || !goalId) {
      return new NextResponse("taskId and goalId are required", {
        status: 400,
      });
    }

    const { count } = await prisma.taskGoalLink.deleteMany({
      where: { taskId, goalId, task: { userId: auth.userId } },
    });
    if (count > 0) {
      await prisma.task.update({ where: { id: taskId }, data: { goalsPinned: true } });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Error deleting task link:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
