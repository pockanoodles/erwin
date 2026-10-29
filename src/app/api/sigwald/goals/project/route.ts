import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { suggestProof } from "@/lib/sigwald/boss-proof";
import { applyGoalRules, calendarDay, type BossBinding } from "@/lib/sigwald/goal-rules";
import { ensureCurrentHex } from "@/lib/sigwald/hex";
import { sanitizeStatKeys, type StatKey } from "@/lib/sigwald/stats";
import { logger } from "@/lib/logger";
import { prisma, type DbTransaction } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";
import { moduleProofItems } from "@/modules/hooks";

const LOG_SOURCE = "SigwaldGoalsProjectAPI";

// The vault is the source of truth for goals; the ops goals-sync pump projects
// them here. Projected rows are tagged with a "venture:" externalId and owned
// entirely by the pump — this endpoint upserts them by (userId, externalId),
// rebuilds their DAG edges, and sets aside projected rows no longer in the
// vault (status "dropped": a goal parked or killed there keeps its finished
// work and its XP here). Hand-made goals (externalId NULL) are never touched.
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
  /** externalId of the parent (a top goal) this goal (a milestone) links under, if any. */
  parentExternalId?: string | null;
  /** A top goal's task sources (the vault's `sources:`). */
  taskSources?: string[];
  /** Boss: the Canvas assignment it is (the vault's `canvas: <id>`). */
  canvasAssignmentId?: string | null;
}

/**
 * What pump 7 should say out loud about the boss bindings: a named assignment
 * Sigwald's gradebook doesn't have, and a vault date Canvas disagrees with. A
 * bound boss needs no ✅: Canvas fells it.
 */
function bindingReport(goals: ProjectedGoal[], bindings: BossBinding[]) {
  const sent = new Map(goals.map((g) => [g.externalId, g]));
  const unresolvedBindings: { externalId: string; canvasAssignmentId: string }[] = [];
  const dateMismatches: { externalId: string; vaultDate: string; canvasDate: string }[] = [];
  for (const b of bindings) {
    if (!b.externalId?.startsWith(PROJECTION_PREFIX)) continue;
    const vault = sent.get(b.externalId);
    if (!b.item) {
      unresolvedBindings.push({ externalId: b.externalId, canvasAssignmentId: b.canvasAssignmentId });
      continue;
    }
    if (vault?.targetDate && b.item.dueDate) {
      const vaultDate = vault.targetDate.slice(0, 10);
      const canvasDate = calendarDay(b.item.dueDate);
      if (vaultDate !== canvasDate) {
        dateMismatches.push({ externalId: b.externalId, vaultDate, canvasDate });
      }
    }
  }
  return { unresolvedBindings, dateMismatches };
}

/**
 * Canvas items the vault's unbound bosses look like, for pump 7 to name: an
 * exam a boss stands for, once Canvas publishes it, is one `canvas:` line
 * away from settling itself. Suggestions only; the vault decides.
 */
async function suggestBindings(db: DbTransaction, userId: string, goals: ProjectedGoal[]) {
  const unbound = goals.filter(
    (g) => g.isBoss && !g.canvasAssignmentId && g.status !== "done" && g.targetDate
  );
  if (unbound.length === 0) return [];
  const taken = new Set(goals.flatMap((g) => (g.canvasAssignmentId ? [String(g.canvasAssignmentId)] : [])));
  const items = await moduleProofItems(db, userId);
  const candidates = items
    .filter((item) => !taken.has(item.ref))
    .map((item) => ({
      canvasId: item.ref,
      name: item.name,
      courseCode: item.courseCode,
      dueDay: item.dueAt ? calendarDay(item.dueAt) : null,
    }));
  return unbound.flatMap((boss) => {
    const match = suggestProof({ title: boss.title, day: boss.targetDate!.slice(0, 10) }, candidates);
    return match
      ? [{ externalId: boss.externalId, canvasAssignmentId: match.canvasId, item: match.name }]
      : [];
  });
}

/**
 * POST /api/sigwald/goals/project
 * Body: { cycleId?: string, goals: ProjectedGoal[], build?: string[] }
 * Idempotently reconciles the set of projected goals for the target cycle
 * (defaults to the active hex), then files tasks under them and settles bosses
 * (lib/sigwald/goal-rules). `build` is the map's Current Build: sent, it becomes
 * the cycle's Build and can't be changed in Sigwald; left out, the Build is
 * Sigwald's to edit again. Returns { cycleId, build, created, updated, dropped,
 * linked, linkedTasks, unlinkedTasks, unresolvedBindings, dateMismatches,
 * suggestedBindings }.
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

    const json = await request.json();
    const goals: ProjectedGoal[] = Array.isArray(json?.goals) ? json.goals : [];

    let build: StatKey[] | null = null;
    if (json?.build !== undefined) {
      build = sanitizeStatKeys(json.build);
      if (build === null || build.length === 0) {
        return new NextResponse("build must be a non-empty list of stat keys", { status: 400 });
      }
    }

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
      if (
        g.taskSources !== undefined &&
        (!Array.isArray(g.taskSources) || g.taskSources.some((s) => typeof s !== "string" || !s))
      ) {
        return new NextResponse(`taskSources for ${g.externalId} must be a list of source names`, {
          status: 400,
        });
      }
      if (g.canvasAssignmentId != null && !/^\d+$/.test(String(g.canvasAssignmentId))) {
        return new NextResponse(`canvasAssignmentId for ${g.externalId} must be a Canvas id`, {
          status: 400,
        });
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
      await tx.goalCycle.update({
        where: { id: cycleId },
        data: build ? { focusStats: build, buildProjected: true } : { buildProjected: false },
      });

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
          // Absent means "none": a vault that drops the line unbinds the boss.
          taskSources: g.taskSources ?? [],
          canvasAssignmentId: g.canvasAssignmentId != null ? String(g.canvasAssignmentId) : null,
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

      // Set aside projected rows the vault no longer defines. They keep their
      // links, so finished work keeps its XP, and a goal the vault brings back
      // under the same slug picks up where it was. A felled boss stays felled.
      const orphanIds = after
        .filter((g) => g.externalId !== null && !desired.has(g.externalId))
        .map((g) => g.id);
      const { count: dropped } = orphanIds.length
        ? await tx.goal.updateMany({
            where: { id: { in: orphanIds }, userId, status: "active" },
            data: { status: "dropped" },
          })
        : { count: 0 };

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

      // File tasks under the goals just projected (their sources, boss
      // bindings). Bound bosses take their Canvas task's date and status here,
      // after the upsert wrote the vault's, so Canvas wins.
      const rules = await applyGoalRules(tx, userId);

      const created = goals.filter((g) => !existingExt.has(g.externalId)).length;
      return {
        created,
        updated: goals.length - created,
        dropped,
        linked,
        linkedTasks: rules.linked,
        unlinkedTasks: rules.unlinked,
        ...bindingReport(goals, rules.bindings),
        suggestedBindings: await suggestBindings(tx, userId, goals),
      };
    });

    return NextResponse.json({ cycleId, build, ...result });
  } catch (error) {
    logger.error(
      "Error projecting goals:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
