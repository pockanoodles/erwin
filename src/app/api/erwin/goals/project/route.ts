import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { ensureCurrentHex } from "@/lib/erwin/hex";
import { sanitizeStatKeys } from "@/lib/erwin/stats";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinGoalsProjectAPI";

// The vault is the source of truth for goals; the ops goals-sync pump projects
// them here. Projected rows are tagged with a "venture:" externalId and owned
// entirely by the pump — this endpoint upserts them by (userId, externalId),
// rebuilds their DAG edges, and prunes projected rows no longer in the vault.
// Hand-made goals (externalId NULL) are never read or touched.
const PROJECTION_PREFIX = "venture:";

interface ProjectedGoal {
  externalId: string;
  title: string;
  whyItMatters?: string | null;
  definitionOfDone?: string | null;
  status?: string;
  importanceScore?: number;
  develops?: string[];
  isBoss?: boolean;
  targetDate?: string | null;
  sortOrder?: number;
  /** externalId of the parent (a Lord) this goal (a boss) links under, if any. */
  parentExternalId?: string | null;
}

/**
 * POST /api/erwin/goals/project
 * Body: { cycleId?: string, goals: ProjectedGoal[] }
 * Idempotently reconciles the set of projected goals for the target cycle
 * (defaults to the active hex). Returns { cycleId, created, updated, deleted, linked }.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;

    const json = await request.json();
    const goals: ProjectedGoal[] = Array.isArray(json?.goals) ? json.goals : [];

    // Validate every goal up front so the transaction is all-or-nothing.
    const seen = new Set<string>();
    const cleanedDevelops = new Map<string, string[] | undefined>();
    for (const g of goals) {
      if (!g || typeof g.externalId !== "string" || !g.externalId.startsWith(PROJECTION_PREFIX)) {
        return new NextResponse(
          `every goal needs an externalId starting with "${PROJECTION_PREFIX}"`,
          { status: 400 }
        );
      }
      if (!g.title) {
        return new NextResponse(`goal ${g.externalId} is missing a title`, {
          status: 400,
        });
      }
      if (seen.has(g.externalId)) {
        return new NextResponse(`duplicate externalId ${g.externalId}`, {
          status: 400,
        });
      }
      seen.add(g.externalId);
      if (g.develops !== undefined) {
        const cleaned = sanitizeStatKeys(g.develops);
        if (cleaned === null) {
          return new NextResponse(
            `develops for ${g.externalId} must be a list of stat keys`,
            { status: 400 }
          );
        }
        cleanedDevelops.set(g.externalId, cleaned);
      }
    }

    // Resolve the target cycle: an explicit owned cycle, else the active hex.
    let cycleId: string | undefined = json?.cycleId;
    if (cycleId) {
      const owned = await prisma.goalCycle.findUnique({
        where: { id: cycleId, userId },
      });
      if (!owned) {
        return new NextResponse("Cycle not found", { status: 404 });
      }
    } else {
      const hex = await ensureCurrentHex(prisma, userId);
      cycleId = hex.id;
    }

    const desired = new Set(goals.map((g) => g.externalId));

    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.goal.findMany({
        where: { userId, externalId: { startsWith: PROJECTION_PREFIX } },
        select: { id: true, externalId: true },
      });
      const existingExt = new Set(
        before.map((g) => g.externalId).filter((e): e is string => e !== null)
      );

      // Upsert each projected goal by its stable external identity.
      for (const g of goals) {
        const develops = cleanedDevelops.has(g.externalId)
          ? cleanedDevelops.get(g.externalId)
          : undefined;
        const targetDate =
          g.targetDate === undefined
            ? undefined
            : g.targetDate === null
              ? null
              : new Date(g.targetDate);
        const common = {
          title: g.title,
          cycleId,
          ...(g.whyItMatters !== undefined && { whyItMatters: g.whyItMatters }),
          ...(g.definitionOfDone !== undefined && {
            definitionOfDone: g.definitionOfDone,
          }),
          ...(g.status !== undefined && { status: g.status }),
          ...(g.importanceScore !== undefined && {
            importanceScore: g.importanceScore,
          }),
          ...(develops !== undefined && { develops }),
          ...(g.isBoss !== undefined && { isBoss: Boolean(g.isBoss) }),
          ...(targetDate !== undefined && { targetDate }),
          ...(g.sortOrder !== undefined && { sortOrder: g.sortOrder }),
        };
        await tx.goal.upsert({
          where: { userId_externalId: { userId, externalId: g.externalId } },
          create: { externalId: g.externalId, userId, ...common },
          update: common,
        });
      }

      // Re-read to get ids for every projected goal (post-upsert).
      const after = await tx.goal.findMany({
        where: { userId, externalId: { startsWith: PROJECTION_PREFIX } },
        select: { id: true, externalId: true },
      });
      const idByExt = new Map(after.map((g) => [g.externalId, g.id]));

      // Prune projected rows the vault no longer defines (cascades their links).
      const orphanIds = after
        .filter((g) => g.externalId !== null && !desired.has(g.externalId))
        .map((g) => g.id);
      if (orphanIds.length > 0) {
        await tx.goal.deleteMany({ where: { id: { in: orphanIds }, userId } });
      }

      // Rebuild projected DAG edges: clear links INTO projected goals, then
      // recreate the desired parentExternalId → externalId edges. Only edges
      // whose child is a projected goal are touched, so hand-made links survive.
      const keptIds = goals
        .map((g) => idByExt.get(g.externalId))
        .filter((id): id is string => Boolean(id));
      if (keptIds.length > 0) {
        await tx.goalLink.deleteMany({ where: { childId: { in: keptIds } } });
      }
      let linked = 0;
      for (const g of goals) {
        if (!g.parentExternalId) continue;
        const parentId = idByExt.get(g.parentExternalId);
        const childId = idByExt.get(g.externalId);
        if (parentId && childId && parentId !== childId) {
          await tx.goalLink.create({ data: { parentId, childId } });
          linked += 1;
        }
      }

      // Link every venture-tagged task to its projected Lord (task.source ===
      // the Lord's externalId). Idempotent — keeps the task↔goal ladder in sync
      // as decompose adds tasks over time. Bosses carry no task source.
      let linkedTasks = 0;
      const lords = after.filter(
        (g) =>
          g.externalId &&
          !g.externalId.includes("#boss:") &&
          desired.has(g.externalId)
      );
      for (const lord of lords) {
        const tasks = await tx.task.findMany({
          where: { userId, source: lord.externalId },
          select: { id: true },
        });
        for (const t of tasks) {
          await tx.taskGoalLink.upsert({
            where: { taskId_goalId: { taskId: t.id, goalId: lord.id } },
            create: { taskId: t.id, goalId: lord.id },
            update: {},
          });
          linkedTasks += 1;
        }
      }

      const created = goals.filter((g) => !existingExt.has(g.externalId)).length;
      return {
        created,
        updated: goals.length - created,
        deleted: orphanIds.length,
        linked,
        linkedTasks,
      };
    });

    return NextResponse.json({ cycleId, ...result });
  } catch (error) {
    logger.error(
      "Error projecting goals:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
