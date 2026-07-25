import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { sanitizeStatKeys } from "@/lib/erwin/stats";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinGoalAPI";

/**
 * GET /api/erwin/goals/[id]
 * Returns a single goal (with its tasks) scoped to the authenticated user.
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
    const goal = await prisma.goal.findUnique({
      where: { id, userId: auth.userId },
      include: {
        taskLinks: { include: { task: true } },
        parentLinks: { select: { parentId: true } },
        childLinks: { select: { childId: true } },
      },
    });

    if (!goal) {
      return new NextResponse("Goal not found", { status: 404 });
    }

    return NextResponse.json(goal);
  } catch (error) {
    logger.error(
      "Error fetching goal:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/**
 * PUT /api/erwin/goals/[id]
 * Updates a goal scoped to the authenticated user.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const { id } = await params;

    const existing = await prisma.goal.findUnique({
      where: { id, userId },
    });
    if (!existing) {
      return new NextResponse("Goal not found", { status: 404 });
    }

    const json = await request.json();
    const { title, whyItMatters, definitionOfDone, status, importanceScore } =
      json;

    let develops: string[] | undefined;
    if (json.develops !== undefined) {
      const cleaned = sanitizeStatKeys(json.develops);
      if (cleaned === null) {
        return new NextResponse("develops must be a list of stat keys", {
          status: 400,
        });
      }
      develops = cleaned;
    }

    // Moving a goal to another cycle must stay within the user's own cycles.
    let cycleId: string | undefined;
    if (json.cycleId !== undefined) {
      const owned = await prisma.goalCycle.findUnique({
        where: { id: json.cycleId, userId },
      });
      if (!owned) {
        return new NextResponse("Cycle not found", { status: 404 });
      }
      cycleId = json.cycleId;
    }

    const changingCycle = cycleId !== undefined && cycleId !== existing.cycleId;

    // Newly crowning a goal as ⚔ boss lifts it to the top of the list;
    // manual drags after that win (the flag never re-pins it).
    let sortOrder: number | undefined;
    if (json.isBoss === true && !existing.isBoss) {
      const bounds = await prisma.goal.aggregate({
        where: { userId, cycleId: cycleId ?? existing.cycleId },
        _min: { sortOrder: true },
      });
      sortOrder = (bounds._min.sortOrder ?? 1) - 1;
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Goal links can't span cycles, so a cycle move severs the goal's edges.
      if (changingCycle) {
        await tx.goalLink.deleteMany({
          where: { OR: [{ parentId: id }, { childId: id }] },
        });
      }
      return tx.goal.update({
        where: { id, userId },
        data: {
          ...(title !== undefined && { title }),
          ...(whyItMatters !== undefined && { whyItMatters }),
          ...(definitionOfDone !== undefined && { definitionOfDone }),
          ...(status !== undefined && { status }),
          ...(importanceScore !== undefined && { importanceScore }),
          ...(develops !== undefined && { develops }),
          ...(json.isBoss !== undefined && { isBoss: Boolean(json.isBoss) }),
          ...(sortOrder !== undefined && { sortOrder }),
          ...(json.targetDate !== undefined && {
            targetDate:
              json.targetDate === null ? null : new Date(json.targetDate),
          }),
          ...(cycleId !== undefined && { cycleId }),
        },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error(
      "Error updating goal:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/**
 * DELETE /api/erwin/goals/[id]
 * Deletes a goal. Its DAG edges and task links cascade away (schema onDelete),
 * but linked goals and tasks themselves survive — in a DAG a child may have
 * other parents, so deletion never takes the subtree with it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const { id } = await params;

    const existing = await prisma.goal.findUnique({
      where: { id, userId },
    });
    if (!existing) {
      return new NextResponse("Goal not found", { status: 404 });
    }

    await prisma.goal.delete({ where: { id, userId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Error deleting goal:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
