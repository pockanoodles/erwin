import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
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
      include: { tasks: true },
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

    const updated = await prisma.goal.update({
      where: { id, userId },
      data: {
        ...(title !== undefined && { title }),
        ...(whyItMatters !== undefined && { whyItMatters }),
        ...(definitionOfDone !== undefined && { definitionOfDone }),
        ...(status !== undefined && { status }),
        ...(importanceScore !== undefined && { importanceScore }),
        ...(cycleId !== undefined && { cycleId }),
      },
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
 * Deletes a goal; linked tasks keep their goalId set null (schema onDelete).
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
