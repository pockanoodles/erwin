/**
 * One Canvas sync for a user. Read-only relative to Canvas.
 *
 * In order: the live courses and this student's grade in each, then per
 * course the gradebook (`sync-canvas-gradebook.ts`) and the tasks projected
 * from it (`sync-canvas-tasks.ts`), then announcements and inbox
 * (`sync-canvas-news.ts`), then materials (`sync-canvas-materials.ts`). Each
 * step's changes go into the activity feed (`activity.ts`) as soon as the step
 * has written them.
 *
 * One course failing is logged and skipped; the others still sync. Anything a
 * step couldn't do (a course, its materials, the inbox, a submissions list)
 * goes into the provider's error (`sync-problems.ts`), which the Courses top
 * bar shows and ops' health check pages on. Runs from the background
 * scheduler (Courses' job in `src/modules/courses/server.ts`) and the Sync Canvas button.
 */
import { Prisma } from "@prisma/client";

import { recordActivity } from "@/lib/canvas/activity";
import type { ActivityDraft } from "@/lib/canvas/activity-plan";
import { createCanvasClient } from "@/lib/canvas/canvas-client";
import {
  hasLiveAssignment,
  isTermNamedCourse,
} from "@/lib/canvas/course-term-filter";
import {
  type GradebookSyncResult,
  syncCourseGradebook,
} from "@/lib/canvas/sync-canvas-gradebook";
import {
  MATERIALS_FULL_INTERVAL_MS,
  type MaterialsSyncStats,
  syncCourseMaterials,
} from "@/lib/canvas/sync-canvas-materials";
import { syncCanvasNews } from "@/lib/canvas/sync-canvas-news";
import {
  normalizeCourseworkImpact,
  projectCourseTasks,
} from "@/lib/canvas/sync-canvas-tasks";
import { courseLabel, syncErrorText, syncProblem } from "@/lib/canvas/sync-problems";
import type { CanvasAssignment, CanvasCourse } from "@/lib/canvas/types";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { tasksChanged } from "@/modules/hooks";

const LOG_SOURCE = "CanvasSync";

export interface CanvasSyncStats {
  courseCount: number;
  /** Tasks written this sync. */
  upserted: number;
  /** Tasks deleted because their assignment is gone or isn't work. */
  removed: number;
  /** Tasks deleted with a course that's no longer live. */
  purged: number;
  assignments: number;
  announcements: number;
  conversations: number;
  /** Activity rows written. */
  activity: number;
  /** Course codes whose gradebook failed this sync. */
  failedCourses: string[];
  /** Everything this sync couldn't do, one line each; joined into the provider's error. */
  problems: string[];
  /** null when every course's materials pass threw. */
  materials: MaterialsSyncStats | null;
}

interface CourseRow {
  id: string;
  code: string | null;
  syllabusHtml: string | null;
  materialsSyncedAt: Date | null;
  activitySince: Date | null;
  courseGrade: string | null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function studentEnrollment(course: CanvasCourse) {
  return course.enrollments?.find((e) => e.type === "student" || e.type === "StudentEnrollment");
}

/** "99.6% A" — what grade activity appends, when Canvas shows the total. */
export function courseGradeText(score: number | null, grade: string | null): string | null {
  if (score == null) {
    return null;
  }
  return `${Math.round(score * 10) / 10}%${grade ? ` ${grade}` : ""}`;
}

async function upsertCourse(userId: string, course: CanvasCourse): Promise<CourseRow> {
  const e = studentEnrollment(course);
  const currentGrade = e?.computed_current_grade ?? null;
  const data = {
    name: course.name,
    code: course.course_code ?? null,
    termName: course.term?.name ?? null,
    currentScore: e?.computed_current_score ?? null,
    currentGrade,
    finalScore: e?.computed_final_score ?? null,
    finalGrade: e?.computed_final_grade ?? null,
    // Canvas sends a default scheme even for courses that don't use letters;
    // a computed letter grade is the sign that this one does.
    gradingScheme:
      currentGrade && course.grading_scheme?.length
        ? (JSON.parse(JSON.stringify(course.grading_scheme)) as Prisma.InputJsonValue)
        : Prisma.DbNull,
    applyGroupWeights: Boolean(course.apply_assignment_group_weights),
  };
  const row = await prisma.course.upsert({
    where: { userId_canvasId: { userId, canvasId: String(course.id) } },
    create: { userId, canvasId: String(course.id), ...data },
    update: data,
    select: {
      id: true,
      code: true,
      syllabusHtml: true,
      materialsSyncedAt: true,
      activitySince: true,
      currentScore: true,
      currentGrade: true,
    },
  });
  return { ...row, courseGrade: courseGradeText(row.currentScore, row.currentGrade) };
}

export async function syncCanvasForUser(
  userId: string,
  options: { forceMaterials?: boolean } = {}
): Promise<CanvasSyncStats> {
  const provider = await prisma.taskProvider.findFirst({
    where: { userId, type: "CANVAS" },
  });
  if (!provider?.accessToken || !provider.serverUrl) {
    throw new Error("Canvas provider is not configured (missing token or base URL)");
  }
  const client = createCanvasClient({
    baseUrl: provider.serverUrl,
    accessToken: provider.accessToken,
  });

  const now = new Date();
  const courses = await client.listActiveCourses();

  // NEU never concludes enrollments, so `enrollment_state=active` alone
  // returns every course ever taken. Keep term-named current courses; keep
  // undated instructor shells only if something is due recently/in future.
  const prefetched = new Map<number, CanvasAssignment[]>();
  const liveCourses: CanvasCourse[] = [];
  for (const course of courses) {
    if (isTermNamedCourse(course, now)) {
      liveCourses.push(course);
      continue;
    }
    const assignments = await client.listAssignments(course.id);
    if (hasLiveAssignment(assignments, now)) {
      prefetched.set(course.id, assignments);
      liveCourses.push(course);
    }
  }
  const liveIds = liveCourses.map((c) => String(c.id));
  const selfId = liveCourses.map((c) => studentEnrollment(c)?.user_id).find((id) => id != null) ?? null;
  const fallbackZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // A course that's no longer live leaves with everything it owns, its
  // tasks too (subtasks and all: the course is over). They're found through
  // their gradebook rows, so before the rows go.
  const { count: purged } = await prisma.task.deleteMany({
    where: {
      userId,
      source: "CANVAS",
      courseAssignment: { course: { userId, canvasId: { notIn: liveIds } } },
    },
  });
  await prisma.course.deleteMany({ where: { userId, canvasId: { notIn: liveIds } } });
  const rows = new Map<number, CourseRow>();
  for (const course of liveCourses) {
    rows.set(course.id, await upsertCourse(userId, course));
  }

  const stats: CanvasSyncStats = {
    courseCount: liveCourses.length,
    upserted: 0,
    removed: 0,
    purged,
    assignments: 0,
    announcements: 0,
    conversations: 0,
    activity: 0,
    failedCourses: [],
    problems: [],
    materials: null,
  };
  // Each step's activity is written right after its own writes, never batched
  // to the end: a sync cut short (a deploy, a crash) must not leave a grade
  // changed in the gradebook with its "grade posted" lost for good.
  const rowById = new Map([...rows.values()].map((r) => [r.id, r]));
  const record = async (rowId: string, list: ActivityDraft[]) => {
    const row = rowById.get(rowId);
    if (row && list.length > 0) {
      stats.activity += await recordActivity(rowId, list, { baseline: row.activitySince == null, now });
    }
  };
  // Courses whose every part synced; only these may leave their first-sync baseline.
  const complete = new Set<number>();
  const gradebooks = new Map<number, GradebookSyncResult>();

  for (const course of liveCourses) {
    const row = rows.get(course.id)!;
    try {
      const gradebook = await syncCourseGradebook(client, row.id, course, {
        now,
        selfId,
        timeZone: course.time_zone || fallbackZone,
        courseGrade: row.courseGrade,
        prefetched: prefetched.get(course.id),
      });
      gradebooks.set(course.id, gradebook);
      await record(row.id, gradebook.activity);
      stats.assignments += gradebook.rowIds.size;
      const tasks = await projectCourseTasks(userId, provider.id, row.id, gradebook, now);
      stats.upserted += tasks.upserted;
      stats.removed += tasks.removed;
      stats.problems.push(...gradebook.problems);
      if (gradebook.problems.length === 0) complete.add(course.id);
    } catch (error) {
      stats.failedCourses.push(courseLabel(course));
      stats.problems.push(syncProblem(`${courseLabel(course)} gradebook failed`, error));
      logger.error("Canvas gradebook sync failed for course", { userId, courseId: course.id, error: errorText(error) }, LOG_SOURCE);
    }
  }

  // Work whose assignment left Canvas lost its gradebook row above. It goes
  // too, unless someone added subtasks: those are their own notes.
  const { count: orphaned } = await prisma.task.deleteMany({
    where: {
      userId,
      source: "CANVAS",
      courseAssignment: { is: null },
      subtasks: { none: {} },
    },
  });
  stats.removed += orphaned;

  await normalizeCourseworkImpact(userId);
  // File new assignments under School (the vault's `sources: [CANVAS]`) and
  // refresh bound bosses' dates now, not at the next morning's projection.
  await tasksChanged(prisma, userId);

  const news = await syncCanvasNews(
    client,
    liveCourses.map((course) => ({ rowId: rows.get(course.id)!.id, course })),
    { now, selfId }
  );
  stats.announcements = news.announcements;
  stats.conversations = news.conversations;
  for (const [rowId, list] of news.activity) await record(rowId, list);
  stats.problems.push(...news.problems);
  for (const course of liveCourses) {
    if (news.incomplete.has(rows.get(course.id)!.id)) complete.delete(course.id);
  }

  // Materials ride along, but never at the gradebook's expense: tasks are
  // already committed, so a materials failure is logged, not thrown.
  const materials: MaterialsSyncStats = { courses: 0, fullPasses: 0, materials: 0, downloaded: 0, links: 0, failedCourses: 0 };
  for (const course of liveCourses) {
    const row = rows.get(course.id)!;
    const gradebook = gradebooks.get(course.id);
    if (!gradebook) {
      continue;
    }
    const full =
      Boolean(options.forceMaterials) ||
      !row.materialsSyncedAt ||
      now.getTime() - row.materialsSyncedAt.getTime() >= MATERIALS_FULL_INTERVAL_MS;
    try {
      const result = await syncCourseMaterials(client, userId, provider.id, row, course, gradebook.assignments, now, { full });
      await record(row.id, result.activity);
      materials.courses += 1;
      materials.fullPasses += full ? 1 : 0;
      materials.materials += result.materials;
      materials.downloaded += result.downloaded;
      materials.links += result.links;
    } catch (error) {
      materials.failedCourses += 1;
      complete.delete(course.id);
      stats.problems.push(syncProblem(`${courseLabel(course)} materials failed`, error));
      logger.error("Canvas materials sync failed for course", { userId, courseId: course.id, error: errorText(error) }, LOG_SOURCE);
    }
  }
  stats.materials = materials.courses > 0 || materials.failedCourses === 0 ? materials : null;

  for (const course of liveCourses) {
    const row = rows.get(course.id)!;
    const baseline = row.activitySince == null;
    await prisma.course.update({
      where: { id: row.id },
      data: {
        lastSyncedAt: now,
        // A course leaves its baseline only once every part of it has synced;
        // otherwise its first real sync would report everything as new.
        ...(baseline && complete.has(course.id) ? { activitySince: now } : {}),
      },
    });
  }

  await prisma.taskProvider.update({
    where: { id: provider.id },
    data: {
      lastSyncedAt: now,
      error: syncErrorText(stats.problems),
    },
  });

  const { materials: m, ...summary } = stats;
  logger.info(
    "Canvas sync completed",
    {
      userId,
      ...summary,
      materialsFullPasses: m?.fullPasses ?? null,
      materialsDownloaded: m?.downloaded ?? null,
      materialsFailedCourses: m?.failedCourses ?? null,
      enrolledCourseCount: courses.length,
    },
    LOG_SOURCE
  );
  return stats;
}
