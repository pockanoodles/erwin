import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { notClosedWhere } from "@/lib/erwin/open-work";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinCoursesAPI";

/**
 * GET /api/erwin/courses
 *
 * The materials library: every mirrored course with its modules and their
 * items in Canvas order, plus description-only materials (moduleId null).
 * Bodies and syllabi are left out to keep the tree light — fetch one via
 * /api/erwin/materials/[id] or /api/erwin/courses/[id]/syllabus.
 *
 * Each material also says what it's for: `task` is the Erwin task behind an
 * assignment/quiz/discussion row, and `nextTask` is the soonest open task the
 * material is linked to (with `openTaskCount` in total). `parentId` nests a
 * file under the page that links to it, and `unseen` flags a material that's
 * new or changed since it was last opened.
 *
 * Each course carries Canvas's current grade and its count of unseen activity.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const materialFields = {
      id: true,
      kind: true,
      title: true,
      position: true,
      indent: true,
      htmlUrl: true,
      locked: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      localPath: true,
      downloadError: true,
      assignmentCanvasId: true,
      moduleId: true,
      parentId: true,
      activity: { where: { seenAt: null }, select: { id: true }, take: 1 },
      taskLinks: {
        where: { task: notClosedWhere() },
        select: { task: { select: { id: true, title: true, dueDate: true } } },
      },
    } as const;

    const courses = await prisma.course.findMany({
      where: { userId: auth.userId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        canvasId: true,
        code: true,
        name: true,
        termName: true,
        lastSyncedAt: true,
        syllabusHtml: true,
        currentScore: true,
        currentGrade: true,
        finalScore: true,
        _count: { select: { activity: { where: { seenAt: null } } } },
        modules: {
          orderBy: { position: "asc" },
          select: {
            id: true,
            name: true,
            position: true,
            unlockAt: true,
            materials: { orderBy: { position: "asc" }, select: materialFields },
          },
        },
        materials: {
          where: { moduleId: null },
          orderBy: { title: "asc" },
          select: materialFields,
        },
      },
    });

    // Assignment rows → their Erwin task. Tasks key Canvas assignments by
    // (courseId, externalTaskId), both Canvas ids.
    const assignmentTasks = await prisma.task.findMany({
      where: {
        userId: auth.userId,
        source: "CANVAS",
        courseId: { in: courses.map((c) => c.canvasId) },
      },
      select: { id: true, courseId: true, externalTaskId: true, dueDate: true, status: true },
    });
    const taskByAssignment = new Map(
      assignmentTasks.map((t) => [`${t.courseId}:${t.externalTaskId}`, t])
    );

    type Row = (typeof courses)[number]["materials"][number];
    const toMaterial =
      (courseCanvasId: string) =>
      ({ localPath, taskLinks, activity, ...rest }: Row) => {
        const open = taskLinks
          .map((l) => l.task)
          .sort(
            (a, b) =>
              (a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY) -
              (b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY)
          );
        const task = rest.assignmentCanvasId
          ? (taskByAssignment.get(`${courseCanvasId}:${rest.assignmentCanvasId}`) ?? null)
          : null;
        return {
          ...rest,
          cached: Boolean(localPath),
          unseen: activity.length > 0,
          task: task ? { id: task.id, dueDate: task.dueDate, status: task.status } : null,
          nextTask: open[0] ?? null,
          openTaskCount: open.length,
        };
      };

    return NextResponse.json(
      courses.map(({ syllabusHtml, materials, modules, _count, ...course }) => ({
        ...course,
        unseenCount: _count.activity,
        hasSyllabus: Boolean(syllabusHtml),
        modules: modules.map((m) => ({
          ...m,
          materials: m.materials.map(toMaterial(course.canvasId)),
        })),
        unfiled: materials.map(toMaterial(course.canvasId)),
      }))
    );
  } catch (error) {
    logger.error(
      "Erwin courses list failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to load courses" }, { status: 500 });
  }
}
