/**
 * Lazy Canvas fetch for grade projections on DANGER Canvas tasks (focus-mode.md §1.3).
 */

import { createCanvasClient } from "@/lib/canvas/canvas-client";
import {
  computeGradeProjectionFromCanvas,
  type GradeProjectionResult,
} from "@/lib/erwin/grade-projection";
import type { FocusQueueTaskRow } from "@/lib/erwin/focus-queue-core";
import type { Stage1Scores } from "@/lib/erwin/rank-stage1";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "FetchCanvasGradeProjections";

/**
 * Returns grade projections keyed by task id (Canvas danger tasks only).
 */
export async function fetchGradeProjectionsForDangerTasks(
  userId: string,
  tasks: FocusQueueTaskRow[],
  meta: Map<string, Stage1Scores>
): Promise<Map<string, GradeProjectionResult>> {
  const out = new Map<string, GradeProjectionResult>();

  const provider = await prisma.taskProvider.findFirst({
    where: { userId, type: "CANVAS", enabled: true },
  });

  if (!provider?.accessToken || !provider.serverUrl) {
    return out;
  }

  const client = createCanvasClient({
    baseUrl: provider.serverUrl,
    accessToken: provider.accessToken,
  });

  const courseCache = new Map<
    number,
    Awaited<ReturnType<typeof client.listAssignmentGroups>>
  >();
  const assignmentCache = new Map<
    number,
    Awaited<ReturnType<typeof client.listAssignments>>
  >();

  for (const t of tasks) {
    const m = meta.get(t.id);
    if (!m?.danger || t.source !== "CANVAS" || !t.courseId || !t.externalTaskId) {
      continue;
    }

    const courseNum = Number.parseInt(t.courseId, 10);
    const aid = Number.parseInt(t.externalTaskId, 10);
    if (!Number.isFinite(courseNum) || !Number.isFinite(aid)) {
      continue;
    }

    try {
      if (!courseCache.has(courseNum)) {
        const groups = await client.listAssignmentGroups(courseNum);
        courseCache.set(courseNum, groups);
      }
      if (!assignmentCache.has(courseNum)) {
        const assignments = await client.listAssignments(courseNum);
        assignmentCache.set(courseNum, assignments);
      }

      const groups = courseCache.get(courseNum)!;
      const assignments = assignmentCache.get(courseNum)!;

      const proj = computeGradeProjectionFromCanvas(
        assignments,
        groups,
        aid
      );
      if (proj) {
        out.set(t.id, proj);
      }
    } catch (error) {
      logger.warn(
        "Grade projection skipped for task",
        {
          taskId: t.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }

  return out;
}
