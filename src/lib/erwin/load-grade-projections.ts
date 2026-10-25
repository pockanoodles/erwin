/**
 * What missing an assignment would do to its course grade ("miss this and
 * the course drops to B+"), read from the gradebook mirror the Canvas sync
 * keeps — so opening Focus never waits on Canvas. focus-mode.md §1.3.
 */

import {
  type GradeProjectionResult,
  type LetterScheme,
  projectMissedAssignment,
} from "@/lib/erwin/grade-projection";
import type { Db } from "@/lib/prisma";

/** One gradebook item to project, under the key the caller wants it back by. */
export interface ProjectionItem {
  key: string;
  /** Course row id (CourseAssignment.courseId). */
  courseRowId: string;
  /** Canvas's id for the assignment. */
  canvasId: string;
}

/** Projections keyed like the items; an item the gradebook can't project is left out. */
export async function projectMissedGrades(
  db: Db,
  userId: string,
  items: ProjectionItem[]
): Promise<Map<string, GradeProjectionResult>> {
  const out = new Map<string, GradeProjectionResult>();
  if (items.length === 0) {
    return out;
  }

  const courses = await db.course.findMany({
    where: { userId, id: { in: [...new Set(items.map((i) => i.courseRowId))] } },
    select: {
      id: true,
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
  const byId = new Map(courses.map((c) => [c.id, c]));

  for (const item of items) {
    const course = byId.get(item.courseRowId);
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
      item.canvasId
    );
    if (projection) {
      out.set(item.key, projection);
    }
  }
  return out;
}
