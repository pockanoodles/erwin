import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinGoalsAPI";

/**
 * GET /api/erwin/goals
 * Lists goals scoped to the active cycle by default. `?cycleId=` targets a
 * specific cycle; `?all=true` returns every goal for the user.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";
    const cycleId = searchParams.get("cycleId");

    let scopeCycleId: string | undefined;
    if (!all) {
      if (cycleId) {
        scopeCycleId = cycleId;
      } else {
        const activeCycle = await prisma.goalCycle.findFirst({
          where: { userId, status: "active" },
          orderBy: { createdAt: "desc" },
        });
        // No active cycle → no default-scoped goals to show.
        if (!activeCycle) {
          return NextResponse.json([]);
        }
        scopeCycleId = activeCycle.id;
      }
    }

    const goals = await prisma.goal.findMany({
      where: {
        userId,
        ...(scopeCycleId && { cycleId: scopeCycleId }),
      },
      orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(goals);
  } catch (error) {
    logger.error(
      "Error listing goals:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/**
 * POST /api/erwin/goals
 * Creates a goal. Defaults to the active cycle when no cycleId is supplied.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const json = await request.json();
    const {
      title,
      whyItMatters,
      definitionOfDone,
      status,
      importanceScore,
      parentGoalId,
    } = json;

    if (!title) {
      return new NextResponse("title is required", { status: 400 });
    }

    let { cycleId } = json;
    if (!cycleId) {
      const activeCycle = await prisma.goalCycle.findFirst({
        where: { userId, status: "active" },
        orderBy: { createdAt: "desc" },
      });
      if (!activeCycle) {
        return new NextResponse(
          "No active cycle; provide a cycleId or create a cycle first",
          { status: 400 }
        );
      }
      cycleId = activeCycle.id;
    } else {
      // Ensure the target cycle belongs to the user.
      const owned = await prisma.goalCycle.findUnique({
        where: { id: cycleId, userId },
      });
      if (!owned) {
        return new NextResponse("Cycle not found", { status: 404 });
      }
    }

    // A parent must be the user's own goal in the same cycle.
    if (parentGoalId) {
      const parent = await prisma.goal.findUnique({
        where: { id: parentGoalId, userId },
      });
      if (!parent) {
        return new NextResponse("Parent goal not found", { status: 404 });
      }
      if (parent.cycleId !== cycleId) {
        return new NextResponse("Parent goal is in a different cycle", {
          status: 400,
        });
      }
    }

    const goal = await prisma.goal.create({
      data: {
        title,
        whyItMatters,
        definitionOfDone,
        ...(status !== undefined && { status }),
        ...(importanceScore !== undefined && { importanceScore }),
        ...(parentGoalId !== undefined && { parentGoalId }),
        cycleId,
        userId,
      },
    });

    return NextResponse.json(goal);
  } catch (error) {
    logger.error(
      "Error creating goal:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
