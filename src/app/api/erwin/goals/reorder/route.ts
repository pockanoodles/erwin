import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinGoalsReorderAPI";

/**
 * PUT /api/erwin/goals/reorder
 * Body: { orderedGoalIds: string[] } — writes list positions (0 = top).
 * Every id must be the user's own goal; positions are written atomically.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "ladder");
    if (off) return off;

    const userId = auth.userId;
    const { orderedGoalIds } = await request.json();
    if (
      !Array.isArray(orderedGoalIds) ||
      orderedGoalIds.length === 0 ||
      orderedGoalIds.some((id) => typeof id !== "string")
    ) {
      return new NextResponse("orderedGoalIds must be a list of goal ids", {
        status: 400,
      });
    }
    const ids = [...new Set(orderedGoalIds as string[])];

    const owned = await prisma.goal.count({
      where: { id: { in: ids }, userId },
    });
    if (owned !== ids.length) {
      return new NextResponse("Goal not found", { status: 404 });
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.goal.update({ where: { id, userId }, data: { sortOrder: index } })
      )
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Error reordering goals:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
