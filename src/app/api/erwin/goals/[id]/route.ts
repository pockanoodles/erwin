import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { checkClaims, checkProof } from "@/lib/erwin/goal-input";
import { applyGoalRules } from "@/lib/erwin/goal-rules";
import { sanitizeStatKeys } from "@/lib/erwin/stats";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinGoalAPI";

/** A goal the vault projects is the vault's: the next projection would undo an edit here. */
const VAULT_OWNED = "This goal comes from your vault, so change it there and the next sync brings it here";

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
    const off = await moduleOffResponse(auth.userId, "ladder");
    if (off) return off;

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
 * Updates a goal made in Erwin: its fields, its claims (`taskSources`) and, for
 * a boss, its proof (`canvasAssignmentId` or `proofTaskId`) and `status` (a
 * boss without proof is marked done by hand). A vault goal answers 409. The
 * goal rules run after, so claims and proof take effect at once.
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
    const off = await moduleOffResponse(auth.userId, "ladder");
    if (off) return off;

    const userId = auth.userId;
    const { id } = await params;

    const existing = await prisma.goal.findUnique({
      where: { id, userId },
    });
    if (!existing) {
      return new NextResponse("Goal not found", { status: 404 });
    }
    if (existing.externalId !== null) {
      return new NextResponse(VAULT_OWNED, { status: 409 });
    }

    const json = await request.json();
    const { title, whyItMatters, definitionOfDone, status, importanceScore } =
      json;
    if (status !== undefined && !["active", "done", "dropped"].includes(status)) {
      return new NextResponse("status must be active, done or dropped", { status: 400 });
    }

    const claims = await checkClaims(prisma, userId, json.taskSources);
    if (!claims.ok) return new NextResponse(claims.error, { status: 400 });
    const proof = await checkProof(prisma, userId, json);
    if (!proof.ok) return new NextResponse(proof.error, { status: 400 });
    const boss = json.isBoss ?? existing.isBoss;

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
          ...(claims.value !== undefined && { taskSources: claims.value }),
          // Proof belongs to bosses; a goal that stops being one loses it.
          ...(proof.value !== undefined && boss && proof.value),
          ...(!boss && { canvasAssignmentId: null, proofTaskId: null }),
        },
      });
    });
    await applyGoalRules(prisma, userId);

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
    const off = await moduleOffResponse(auth.userId, "ladder");
    if (off) return off;

    const userId = auth.userId;
    const { id } = await params;

    const existing = await prisma.goal.findUnique({
      where: { id, userId },
    });
    if (!existing) {
      return new NextResponse("Goal not found", { status: 404 });
    }

    if (existing.externalId !== null) {
      return new NextResponse(VAULT_OWNED, { status: 409 });
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
