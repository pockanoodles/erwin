import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { linkWouldCreateLoop } from "@/lib/erwin/goal-links";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinGoalLinksAPI";

/**
 * POST /api/erwin/goals/links
 * Adds a parent→child edge to the goal DAG. Both goals must belong to the
 * user and live in the same cycle; edges that would close a loop are rejected.
 * Idempotent: re-posting an existing edge returns it unchanged.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "ladder");
    if (off) return off;

    const userId = auth.userId;
    const { parentGoalId, childGoalId } = await request.json();
    if (!parentGoalId || !childGoalId) {
      return new NextResponse("parentGoalId and childGoalId are required", {
        status: 400,
      });
    }
    if (parentGoalId === childGoalId) {
      return new NextResponse("A goal cannot link to itself", { status: 400 });
    }

    const [parent, child] = await Promise.all([
      prisma.goal.findUnique({ where: { id: parentGoalId, userId } }),
      prisma.goal.findUnique({ where: { id: childGoalId, userId } }),
    ]);
    if (!parent || !child) {
      return new NextResponse("Goal not found", { status: 404 });
    }
    if (parent.cycleId !== child.cycleId) {
      return new NextResponse("Goals are in different cycles", { status: 400 });
    }

    if (
      await linkWouldCreateLoop(prisma, parent.cycleId, parentGoalId, childGoalId)
    ) {
      return new NextResponse("Link would create a loop", { status: 400 });
    }

    const link = await prisma.goalLink.upsert({
      where: {
        parentId_childId: { parentId: parentGoalId, childId: childGoalId },
      },
      create: { parentId: parentGoalId, childId: childGoalId },
      update: {},
    });

    return NextResponse.json(link);
  } catch (error) {
    logger.error(
      "Error creating goal link:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/**
 * DELETE /api/erwin/goals/links?parentGoalId=…&childGoalId=…
 * Removes an edge. The child goal survives — it just stops feeding that parent.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "ladder");
    if (off) return off;

    const { searchParams } = new URL(request.url);
    const parentGoalId = searchParams.get("parentGoalId");
    const childGoalId = searchParams.get("childGoalId");
    if (!parentGoalId || !childGoalId) {
      return new NextResponse("parentGoalId and childGoalId are required", {
        status: 400,
      });
    }

    await prisma.goalLink.deleteMany({
      where: {
        parentId: parentGoalId,
        childId: childGoalId,
        parent: { userId: auth.userId },
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Error deleting goal link:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
