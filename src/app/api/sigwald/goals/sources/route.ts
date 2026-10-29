import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { formatInTimeZone } from "@/lib/date-utils";
import { SOURCE_CLAIMS } from "@/lib/sigwald/goal-input";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";
import { moduleClaimOptions, moduleProofItems } from "@/modules/hooks";

const LOG_SOURCE = "SigwaldGoalSourcesAPI";

/** How far back finished tasks are still offered as a boss's proof. */
const RECENT_DAYS = 60;

/**
 * GET /api/sigwald/goals/sources
 *
 * What a goal made in Sigwald can claim and a boss can name as proof, for the
 * goal form: whole task sources that have work in them, what the modules
 * offer (Courses: its courses), projects, every item a boss can name (Courses:
 * the gradebook, with what each says now), and the tasks from elsewhere
 * (open, or finished in the last 60 days).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "ladder");
    if (off) return off;
    const userId = auth.userId;
    const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { timeZone: true } });
    const dayOf = (d: Date) => formatInTimeZone(d, settings?.timeZone ?? "UTC", "yyyy-MM-dd");
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);

    const [bySource, claimOptions, projects, items, bound, tasks] = await Promise.all([
      prisma.task.groupBy({ by: ["source"], where: { userId, parentTaskId: null }, _count: true }),
      moduleClaimOptions(prisma, userId),
      prisma.project.findMany({
        where: { userId, status: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // What a boss can name as proof: Courses' gradebook items.
      moduleProofItems(prisma, userId),
      prisma.goal.findMany({
        where: { userId, isBoss: true, status: { not: "dropped" }, canvasAssignmentId: { not: null } },
        select: { id: true, canvasAssignmentId: true },
      }),
      prisma.task.findMany({
        where: {
          userId,
          parentTaskId: null,
          // Canvas work is offered as gradebook items above. SQL's NOT also
          // drops a null source, so tasks made by hand need their own branch.
          AND: [
            { OR: [{ source: null }, { source: { not: "CANVAS" } }] },
            { OR: [{ status: { not: "completed" } }, { completedAt: { gte: since } }] },
          ],
        },
        select: { id: true, title: true, source: true, dueDate: true, status: true },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
      }),
    ]);

    const boundTo = new Map(bound.map((g) => [g.canvasAssignmentId, g.id]));
    const present = new Set(bySource.map((row) => row.source));

    return NextResponse.json({
      sources: SOURCE_CLAIMS.filter((claim) => present.has(claim.key)),
      claimOptions,
      projects,
      items: items.map((item) => ({
        canvasId: item.ref,
        courseId: item.groupId,
        courseCode: item.courseCode,
        name: item.name,
        dueDay: item.dueAt ? dayOf(item.dueAt) : null,
        label: item.label,
        boundTo: boundTo.get(item.ref) ?? null,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        source: task.source,
        dueDay: task.dueDate ? dayOf(task.dueDate) : null,
        done: task.status === "completed",
      })),
    });
  } catch (error) {
    logger.error(
      "Goal sources failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load what goals can claim" }, { status: 500 });
  }
}
