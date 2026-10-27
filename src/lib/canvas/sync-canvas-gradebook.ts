/**
 * Canvas gradebook mirror for one course: assignment groups, every assignment
 * with this student's submission (score, comments, rubric marks), and quiz
 * settings. Canvas is the source of truth — groups and assignments it no
 * longer returns are pruned — with Kaito's corrections laid over it
 * (`corrections.ts`). Hands back the merged assignments so the task
 * projection and the materials mirror reuse them instead of asking again.
 */
import { Prisma } from "@prisma/client";

import type { ActivityDraft } from "@/lib/canvas/activity-plan";
import { type CanvasClient, isHiddenFromStudents } from "@/lib/canvas/canvas-client";
import {
  type Retirement,
  activityBaseline,
  applyCorrections,
  storedCorrections,
} from "@/lib/canvas/corrections";
import {
  type PlannedAssignment,
  assignmentActivity,
  isActionable,
  mergeSubmission,
  planAssignment,
  storedComments,
} from "@/lib/canvas/gradebook-plan";
import { courseLabel, syncProblem } from "@/lib/canvas/sync-problems";
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
  /** Reads that failed this sync (not ones the course hides); the sync reports them. */
  problems: string[];
}

/**
 * A read the gradebook can do without. One the course hides from students
 * reads as empty. Any other failure is a problem the sync reports, and null
 * tells the caller to leave what this read would have written as stored.
 */
async function extra<T>(
  what: string,
  course: CanvasCourse,
  problems: string[],
  read: () => Promise<T[]>
): Promise<T[] | null> {
  try {
    return await read();
  } catch (error) {
    if (isHiddenFromStudents(error)) {
      return [];
    }
    problems.push(syncProblem(`${courseLabel(course)} ${what} unavailable`, error));
    logger.error(
      `Canvas ${what} unavailable`,
      { courseId: course.id, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return null;
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
  const problems: string[] = [];
  const [groups, listed, submissions, quizzes] = await Promise.all([
    client.listAssignmentGroups(course.id),
    options.prefetched ? Promise.resolve(options.prefetched) : client.listAssignments(course.id),
    extra<CanvasSubmission>("submissions", course, problems, () => client.listSubmissions(course.id)),
    extra<CanvasQuiz>("quizzes", course, problems, () => client.listQuizzes(course.id)),
  ]);

  const submissionFor = new Map((submissions ?? []).map((s) => [s.assignment_id, s]));
  const assignments = listed.map((a) => ({
    ...a,
    submission: mergeSubmission(a.submission, submissionFor.get(a.id)),
  }));
  const quizFor = new Map(
    (quizzes ?? []).flatMap((q) => (q.assignment_id != null ? [[q.assignment_id, q] as const] : []))
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
    select: {
      canvasId: true,
      dueAt: true,
      state: true,
      score: true,
      grade: true,
      comments: true,
      corrections: true,
    },
  });
  const previousById = new Map(
    previous.map((p) => [
      p.canvasId,
      { ...p, comments: storedComments(p.comments), corrections: storedCorrections(p.corrections) },
    ])
  );
  const corrections = await prisma.canvasCorrection.findMany({
    where: { courseId: courseRowId, retiredAt: null },
  });
  const retirements: Retirement[] = [];

  const planned = new Map<string, PlannedAssignment>();
  const rowIds = new Map<string, string>();
  const activity: ActivityDraft[] = [];
  for (const a of assignments) {
    const corrected = applyCorrections(
      planAssignment(a, quizFor.get(a.id), options.selfId, now),
      corrections,
      options.timeZone
    );
    const { plan, applied, retired } = corrected;
    const prev = previousById.get(plan.canvasId);
    planned.set(plan.canvasId, plan);
    retirements.push(...retired);
    activity.push(
      ...retired.map((r) => ({
        kind: "CORRECTION_RETIRED" as const,
        title: plan.name,
        detail: `${r.note}, so your correction no longer applies`,
        dedupeKey: `correction:${r.id}`,
        occurredAt: now,
        target: { assignment: plan.canvasId },
      })),
      ...assignmentActivity(
        activityBaseline(prev, prev?.corrections ?? [], corrected),
        plan,
        { actionable: isActionable(a), timeZone: options.timeZone, courseGrade: options.courseGrade },
        now
      )
    );

    const {
      canvasId,
      groupCanvasId,
      comments,
      scoreStatistics,
      rubric,
      rubricAssessment,
      quizTimeLimit,
      quizAllowedAttempts,
      quizQuestionCount,
      lockdownBrowser,
      ...fields
    } = plan;
    const data = {
      ...fields,
      groupId: groupCanvasId ? (groupRowIds.get(groupCanvasId) ?? null) : null,
      scoreStatistics: json(scoreStatistics),
      rubric: json(rubric),
      corrections: applied.length > 0 ? json(applied) : Prisma.DbNull,
      lastSyncedAt: now,
    };
    // What the extras supply. A failed read would blank it, so an update
    // leaves it as stored.
    const fromSubmissions = {
      comments: comments.length > 0 ? json(comments) : Prisma.DbNull,
      rubricAssessment: json(rubricAssessment),
    };
    const fromQuiz = { quizTimeLimit, quizAllowedAttempts, quizQuestionCount, lockdownBrowser };
    const row = await prisma.courseAssignment.upsert({
      where: { courseId_canvasId: { courseId: courseRowId, canvasId } },
      create: { courseId: courseRowId, canvasId, ...data, ...fromSubmissions, ...fromQuiz },
      update: { ...data, ...(submissions ? fromSubmissions : {}), ...(quizzes ? fromQuiz : {}) },
      select: { id: true },
    });
    rowIds.set(canvasId, row.id);
  }

  for (const r of retirements) {
    await prisma.canvasCorrection.update({
      where: { id: r.id },
      data: { retiredAt: now, retiredNote: r.note },
    });
  }

  await prisma.courseAssignment.deleteMany({
    where: { courseId: courseRowId, canvasId: { notIn: [...rowIds.keys()] } },
  });
  await prisma.courseAssignmentGroup.deleteMany({
    where: { courseId: courseRowId, canvasId: { notIn: [...groupRowIds.keys()] } },
  });

  return { assignments, groups, planned, rowIds, activity, problems };
}
