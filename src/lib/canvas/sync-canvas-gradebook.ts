/**
 * Canvas gradebook mirror for one course: assignment groups, every assignment
 * with this student's submission (score, comments, rubric marks), and quiz
 * settings. Canvas is the source of truth — groups and assignments it no
 * longer returns are pruned. Hands back the merged assignments so the task
 * projection and the materials mirror reuse them instead of asking again.
 */
import { Prisma } from "@prisma/client";

import type { ActivityDraft } from "@/lib/canvas/activity-plan";
import type { CanvasClient } from "@/lib/canvas/canvas-client";
import {
  type PlannedAssignment,
  assignmentActivity,
  isActionable,
  mergeSubmission,
  planAssignment,
  storedComments,
} from "@/lib/canvas/gradebook-plan";
import type {
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasCourse,
  CanvasQuiz,
  CanvasSubmission,
} from "@/lib/canvas/types";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CanvasGradebookSync";

export interface GradebookSyncResult {
  /** Canvas assignments with the full submission merged in. */
  assignments: CanvasAssignment[];
  groups: CanvasAssignmentGroup[];
  /** What was stored for each assignment, by Canvas id. */
  planned: Map<string, PlannedAssignment>;
  /** CourseAssignment row id by Canvas id. */
  rowIds: Map<string, string>;
  activity: ActivityDraft[];
}

/** Extras a course may hide from students; losing one must not cost the gradebook. */
async function optional<T>(label: string, courseId: number, read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    logger.warn(
      `Canvas ${label} unavailable`,
      { courseId, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return [];
  }
}

const json = (value: unknown) =>
  value == null ? Prisma.DbNull : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

export async function syncCourseGradebook(
  client: CanvasClient,
  courseRowId: string,
  course: CanvasCourse,
  options: {
    now: Date;
    selfId: number | null;
    timeZone: string;
    /** "99.6% A", for grade activity. */
    courseGrade: string | null;
    /** Assignments the course filter already fetched. */
    prefetched?: CanvasAssignment[];
  }
): Promise<GradebookSyncResult> {
  const { now } = options;
  const [groups, listed, submissions, quizzes] = await Promise.all([
    client.listAssignmentGroups(course.id),
    options.prefetched ? Promise.resolve(options.prefetched) : client.listAssignments(course.id),
    optional<CanvasSubmission>("submissions", course.id, () => client.listSubmissions(course.id)),
    optional<CanvasQuiz>("quizzes", course.id, () => client.listQuizzes(course.id)),
  ]);

  const submissionFor = new Map(submissions.map((s) => [s.assignment_id, s]));
  const assignments = listed.map((a) => ({
    ...a,
    submission: mergeSubmission(a.submission, submissionFor.get(a.id)),
  }));
  const quizFor = new Map(
    quizzes.flatMap((q) => (q.assignment_id != null ? [[q.assignment_id, q] as const] : []))
  );

  const groupRowIds = new Map<string, string>();
  for (const g of groups) {
    const data = {
      name: g.name,
      position: g.position ?? 0,
      weight: g.group_weight ?? null,
      dropLowest: g.rules?.drop_lowest ?? 0,
      dropHighest: g.rules?.drop_highest ?? 0,
      neverDrop: (g.rules?.never_drop ?? []).map(String),
    };
    const row = await prisma.courseAssignmentGroup.upsert({
      where: { courseId_canvasId: { courseId: courseRowId, canvasId: String(g.id) } },
      create: { courseId: courseRowId, canvasId: String(g.id), ...data },
      update: data,
      select: { id: true },
    });
    groupRowIds.set(String(g.id), row.id);
  }

  const previous = await prisma.courseAssignment.findMany({
    where: { courseId: courseRowId },
    select: { canvasId: true, dueAt: true, state: true, score: true, grade: true, comments: true },
  });
  const previousById = new Map(
    previous.map((p) => [p.canvasId, { ...p, comments: storedComments(p.comments) }])
  );

  const planned = new Map<string, PlannedAssignment>();
  const rowIds = new Map<string, string>();
  const activity: ActivityDraft[] = [];
  for (const a of assignments) {
    const plan = planAssignment(a, quizFor.get(a.id), options.selfId, now);
    planned.set(plan.canvasId, plan);
    activity.push(
      ...assignmentActivity(
        previousById.get(plan.canvasId),
        plan,
        { actionable: isActionable(a), timeZone: options.timeZone, courseGrade: options.courseGrade },
        now
      )
    );

    const { canvasId, groupCanvasId, comments, scoreStatistics, rubricAssessment, ...fields } = plan;
    const data = {
      ...fields,
      groupId: groupCanvasId ? (groupRowIds.get(groupCanvasId) ?? null) : null,
      comments: comments.length > 0 ? json(comments) : Prisma.DbNull,
      scoreStatistics: json(scoreStatistics),
      rubricAssessment: json(rubricAssessment),
      lastSyncedAt: now,
    };
    const row = await prisma.courseAssignment.upsert({
      where: { courseId_canvasId: { courseId: courseRowId, canvasId } },
      create: { courseId: courseRowId, canvasId, ...data },
      update: data,
      select: { id: true },
    });
    rowIds.set(canvasId, row.id);
  }

  await prisma.courseAssignment.deleteMany({
    where: { courseId: courseRowId, canvasId: { notIn: [...rowIds.keys()] } },
  });
  await prisma.courseAssignmentGroup.deleteMany({
    where: { courseId: courseRowId, canvasId: { notIn: [...groupRowIds.keys()] } },
  });

  return { assignments, groups, planned, rowIds, activity };
}
