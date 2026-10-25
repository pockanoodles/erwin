/**
 * What Courses tells the core about its tasks (src/modules/server.ts), spread
 * onto each Canvas task wherever the core hands tasks out:
 *
 *  - `courseId` (Canvas's id for the course) and `courseName`;
 *  - `submissionStatus`, Canvas's word on the submission: unsubmitted |
 *    missing | missed | submitted | pending_review | graded | excused. Ops
 *    reads it to tell a hand-ticked completion from one Canvas confirmed;
 *  - `gradeWeightPercent`: roughly how much of the course grade it's worth;
 *  - `gradeProjection`, for work Focus judged DANGER: the course grade now
 *    and if this is missed;
 *  - `materialCount`: course materials linked to it, and how many its
 *    instructions cite (the Tasks sheet's Mat column).
 *
 * For Focus's ranking, each task's stakes: its points, compared within its
 * course. And the key a goal claims a course's work by:
 * `course:<Canvas course id>`.
 */
import { projectMissedGrades } from "@/lib/erwin/load-grade-projections";
import type { RankSignals } from "@/lib/erwin/rank-stage1";
import type { Db, DbTransaction } from "@/lib/prisma";

import type { FactsRequest, TaskFacts } from "@/modules/server";

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

export async function courseTaskFacts(
  db: Db,
  userId: string,
  tasks: FactsRequest[]
): Promise<Map<string, TaskFacts>> {
  const rows = await db.courseAssignment.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) }, course: { userId } },
    select: {
      taskId: true,
      canvasId: true,
      courseId: true,
      state: true,
      gradeWeightPercent: true,
      course: { select: { canvasId: true, name: true } },
    },
  });

  const linkCounts = await db.taskMaterialLink.groupBy({
    by: ["taskId", "reason"],
    where: { taskId: { in: tasks.map((t) => t.id) } },
    _count: { _all: true },
  });
  const materials = new Map<string, { total: number; cited: number }>();
  for (const row of linkCounts) {
    const entry = materials.get(row.taskId) ?? { total: 0, cited: 0 };
    entry.total += row._count._all;
    if (row.reason === "DESCRIPTION") entry.cited += row._count._all;
    materials.set(row.taskId, entry);
  }

  const danger = new Set(tasks.filter((t) => t.danger).map((t) => t.id));
  const projections = await projectMissedGrades(
    db,
    userId,
    rows.flatMap((r) =>
      r.taskId && danger.has(r.taskId)
        ? [{ key: r.taskId, courseRowId: r.courseId, canvasId: r.canvasId }]
        : []
    )
  );

  const facts = new Map<string, TaskFacts>();
  for (const r of rows) {
    if (!r.taskId) continue;
    const weight = r.gradeWeightPercent;
    const p = projections.get(r.taskId);
    facts.set(r.taskId, {
      courseId: r.course.canvasId,
      courseName: r.course.name,
      submissionStatus: r.state,
      gradeWeightPercent: weight == null ? null : oneDecimal(weight),
      gradeProjection: p
        ? {
            currentGrade: p.currentCourseGrade,
            gradeIfMissed: p.gradeIfMissed,
            letterCurrent: p.letterGradeCurrent,
            letterIfMissed: p.letterGradeIfMissed,
          }
        : null,
      materialCount: materials.get(r.taskId) ?? null,
    });
  }
  return facts;
}

export async function courseRankSignals(
  db: Db,
  userId: string,
  taskIds: string[]
): Promise<Map<string, RankSignals>> {
  const rows = await db.courseAssignment.findMany({
    where: { taskId: { in: taskIds }, course: { userId } },
    select: {
      taskId: true,
      pointsPossible: true,
      course: { select: { canvasId: true } },
    },
  });
  return new Map(
    rows.flatMap((r) =>
      r.taskId
        ? [
            [
              r.taskId,
              { stakes: r.pointsPossible ?? 0, stakesGroup: r.course.canvasId },
            ] as const,
          ]
        : []
    )
  );
}

export async function courseClaimKeys(
  db: Db | DbTransaction,
  userId: string,
  taskIds: string[]
): Promise<Map<string, string[]>> {
  const rows = await db.courseAssignment.findMany({
    where: { taskId: { in: taskIds }, course: { userId } },
    select: { taskId: true, course: { select: { canvasId: true } } },
  });
  return new Map(
    rows.flatMap((r) =>
      r.taskId ? [[r.taskId, [`course:${r.course.canvasId}`]] as const] : []
    )
  );
}
