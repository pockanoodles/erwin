import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { checkClaims, checkProof } from "@/lib/erwin/goal-input";
import { applyGoalRules } from "@/lib/erwin/goal-rules";
import { sanitizeStatKeys } from "@/lib/erwin/stats";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinGoalsAPI";

/**
 * GET /api/erwin/goals
 * Lists goals scoped to the active cycle by default, leaving out goals set
 * aside. `?cycleId=` targets a specific cycle; `?all=true` returns every goal
 * for the user.
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
        ...(!all && { status: { not: "dropped" } }),
      },
      orderBy: [
        { sortOrder: "asc" },
        { isBoss: "desc" },
        { importanceScore: "desc" },
        { createdAt: "asc" },
      ],
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
 * `taskSources` claims work for it (lib/erwin/goal-input), and a boss can name
 * its proof (`canvasAssignmentId` or `proofTaskId`); the goal rules run right
 * after, so claimed tasks and a settled boss show at once.
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
      isBoss,
      targetDate,
      parentGoalIds,
    } = json;

    if (!title) {
      return new NextResponse("title is required", { status: 400 });
    }

    const claims = await checkClaims(prisma, userId, json.taskSources);
    if (!claims.ok) return new NextResponse(claims.error, { status: 400 });
    const proof = await checkProof(prisma, userId, json);
    if (!proof.ok) return new NextResponse(proof.error, { status: 400 });

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

    // Every parent must be the user's own goal in the same cycle. A new goal
    // has no descendants, so linking under any set of parents can't loop.
    const parentIds: string[] = Array.isArray(parentGoalIds)
      ? [...new Set(parentGoalIds as string[])]
      : [];
    if (parentIds.length > 0) {
      const parents = await prisma.goal.findMany({
        where: { id: { in: parentIds }, userId },
      });
      if (parents.length !== parentIds.length) {
        return new NextResponse("Parent goal not found", { status: 404 });
      }
      if (parents.some((p) => p.cycleId !== cycleId)) {
        return new NextResponse("Parent goal is in a different cycle", {
          status: 400,
        });
      }
    }

    // New goals append to the bottom of the cycle's manual order — except a
    // ⚔ boss, which enters at the top (it's the hex's headline fight).
    const orderBounds = await prisma.goal.aggregate({
      where: { userId, cycleId },
      _max: { sortOrder: true },
      _min: { sortOrder: true },
    });
    const sortOrder = isBoss
      ? (orderBounds._min.sortOrder ?? 1) - 1
      : (orderBounds._max.sortOrder ?? -1) + 1;

    const goal = await prisma.goal.create({
      data: {
        title,
        whyItMatters,
        definitionOfDone,
        sortOrder,
        ...(status !== undefined && { status }),
        ...(importanceScore !== undefined && { importanceScore }),
        ...(develops !== undefined && { develops }),
        ...(isBoss !== undefined && { isBoss: Boolean(isBoss) }),
        ...(targetDate !== undefined && {
          targetDate: targetDate === null ? null : new Date(targetDate),
        }),
        ...(claims.value !== undefined && { taskSources: claims.value }),
        ...(proof.value !== undefined && isBoss && proof.value),
        cycleId,
        userId,
        ...(parentIds.length > 0 && {
          parentLinks: {
            create: parentIds.map((parentId) => ({ parentId })),
          },
        }),
      },
      include: { parentLinks: { select: { parentId: true } } },
    });
    await applyGoalRules(prisma, userId);

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
