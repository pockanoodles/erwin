/**
 * Grade projections for Focus's DANGER Canvas tasks ("miss this and the
 * course drops to B+"), read from the gradebook mirror the Canvas sync keeps —
 * so opening Focus never waits on Canvas. focus-mode.md §1.3.
 */

import type { FocusQueueTaskRow } from "@/lib/erwin/focus-queue-core";
import {
  type GradeProjectionResult,
  type LetterScheme,
  projectMissedAssignment,
} from "@/lib/erwin/grade-projection";
import type { Stage1Scores } from "@/lib/erwin/rank-stage1";
import { prisma } from "@/lib/prisma";

/**
 * Returns grade projections keyed by task id (Canvas danger tasks only).
 */
export async function loadGradeProjectionsForDangerTasks(
  userId: string,
  tasks: FocusQueueTaskRow[],
  meta: Map<string, Stage1Scores>
): Promise<Map<string, GradeProjectionResult>> {
  const out = new Map<string, GradeProjectionResult>();
  const danger = tasks.filter(
    (t) => meta.get(t.id)?.danger && t.source === "CANVAS" && t.courseId && t.externalTaskId
  );
  if (danger.length === 0) {
    return out;
  }

  const courses = await prisma.course.findMany({
    where: { userId, canvasId: { in: [...new Set(danger.map((t) => t.courseId!))] } },
    select: {
      canvasId: true,
      currentScore: true,
      gradingScheme: true,
      applyGroupWeights: true,
      assignmentGroups: {
        select: { id: true, weight: true, dropLowest: true, dropHighest: true, neverDrop: true },
      },
      assignments: {
        select: {
          canvasId: true,
          groupId: true,
          pointsPossible: true,
          omitFromFinalGrade: true,
          state: true,
          score: true,
        },
      },
    },
  });
  const byCanvasId = new Map(courses.map((c) => [c.canvasId, c]));

  for (const t of danger) {
    const course = byCanvasId.get(t.courseId!);
    if (!course) {
      continue;
    }
    const projection = projectMissedAssignment(
      {
        weighted: course.applyGroupWeights,
        canvasCurrentScore: course.currentScore,
        scheme: Array.isArray(course.gradingScheme) ? (course.gradingScheme as LetterScheme) : null,
        entries: course.assignments,
        groups: course.assignmentGroups,
      },
      t.externalTaskId!
    );
    if (projection) {
      out.set(t.id, projection);
    }
  }
  return out;
}
