import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { formatInTimeZone } from "@/lib/date-utils";
import { canvasProof } from "@/lib/erwin/boss-proof";
import { CLAIMABLE_SOURCES } from "@/lib/erwin/goal-input";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinGoalSourcesAPI";

/** How far back finished tasks are still offered as a boss's proof. */
const RECENT_DAYS = 60;

/**
 * GET /api/erwin/goals/sources
 *
 * What a goal made in Erwin can claim and a boss can name as proof, for the
 * goal form: whole task sources that have work in them, Canvas courses,
 * projects, every Canvas gradebook item with what it says now, and the tasks
 * from elsewhere (open, or finished in the last 60 days).
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

    const [bySource, courses, projects, items, bound, tasks] = await Promise.all([
      prisma.task.groupBy({ by: ["source"], where: { userId, parentTaskId: null }, _count: true }),
      prisma.course.findMany({
        where: { userId },
        select: { id: true, canvasId: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
      prisma.project.findMany({
        where: { userId, status: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.courseAssignment.findMany({
        where: { course: { userId } },
        select: {
          canvasId: true,
          name: true,
          dueAt: true,
          state: true,
          score: true,
          pointsPossible: true,
          grade: true,
          courseId: true,
        },
        orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      }),
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
    const courseCode = new Map(courses.map((c) => [c.id, c.code]));
    const present = new Set(bySource.map((row) => row.source));

    return NextResponse.json({
      sources: CLAIMABLE_SOURCES.filter((source) => present.has(source)),
      // A course is claimed by its Canvas id, which tasks carry as courseId.
      courses: courses.map(({ canvasId, code, name }) => ({ canvasId, code, name })),
      projects,
      items: items.map((item) => ({
        canvasId: item.canvasId,
        courseId: item.courseId,
        courseCode: courseCode.get(item.courseId) ?? null,
        name: item.name,
        dueDay: item.dueAt ? dayOf(item.dueAt) : null,
        label: canvasProof(item).label,
        boundTo: boundTo.get(item.canvasId) ?? null,
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
