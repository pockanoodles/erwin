/**
 * Canvas materials mirror: each live course's syllabus, modules, module items
 * (files, pages, links, graded work), plus files and pages reached only from
 * an assignment description — and the task ↔ material links between them.
 *
 * Runs after the task sync (`sync-canvas-tasks.ts`), reusing its course list
 * and assignments. Canvas is the source of truth: anything Canvas no longer
 * returns is pruned. Heavier than the task sync (a call per page and per
 * file), so a course is re-mirrored at most every MATERIALS_INTERVAL; files
 * re-download only when Canvas reports a newer `updated_at`.
 */
import { stat } from "node:fs/promises";

import type { CanvasClient } from "@/lib/canvas/canvas-client";
import { localPathFor, maxFileBytes, writeDownload } from "@/lib/canvas/material-files";
import {
  type PlannedItem,
  assignmentIdMaps,
  descriptionRefs,
  planModuleItem,
  planTaskLinks,
} from "@/lib/canvas/materials-plan";
import type { CanvasAssignment, CanvasCourse } from "@/lib/canvas/types";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CanvasMaterialsSync";

const MATERIALS_INTERVAL_MS = 6 * 3_600_000;

export interface MaterialsSyncStats {
  courses: number;
  skippedFresh: number;
  materials: number;
  downloaded: number;
  links: number;
  failedCourses: number;
}

interface FileFields {
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  fileUpdatedAt: Date | null;
  localPath: string | null;
  downloadError: string | null;
  locked: boolean;
}

async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false
  );
}

/**
 * Metadata + cached bytes for one Canvas file. Never throws: a file that
 * can't be read or fetched is recorded with `downloadError` so the gap is
 * visible instead of silently missing.
 */
async function resolveFile(
  client: CanvasClient,
  courseCanvasId: number,
  fileCanvasId: string,
  previous: { fileUpdatedAt: Date | null; localPath: string | null } | undefined
): Promise<FileFields & { downloaded: boolean }> {
  const blank: FileFields = {
    fileName: null,
    contentType: null,
    sizeBytes: null,
    fileUpdatedAt: null,
    localPath: null,
    downloadError: null,
    locked: false,
  };
  let file;
  try {
    file = await client.getFile(courseCanvasId, Number(fileCanvasId));
  } catch (error) {
    return { ...blank, downloadError: errorText(error), downloaded: false };
  }
  const fields: FileFields = {
    ...blank,
    fileName: file.display_name,
    contentType: file["content-type"] ?? null,
    sizeBytes: file.size ?? null,
    fileUpdatedAt: file.updated_at ? new Date(file.updated_at) : null,
    locked: Boolean(file.locked_for_user),
  };
  if (fields.locked) {
    return { ...fields, downloadError: "locked in Canvas", downloaded: false };
  }
  if ((file.size ?? 0) > maxFileBytes()) {
    return { ...fields, downloadError: `over the ${maxFileBytes() / 1_000_000} MB cap`, downloaded: false };
  }

  const dest = localPathFor(String(courseCanvasId), fileCanvasId, file.display_name);
  const unchanged =
    previous?.localPath === dest &&
    previous.fileUpdatedAt?.getTime() === fields.fileUpdatedAt?.getTime() &&
    (await exists(dest));
  if (unchanged) {
    return { ...fields, localPath: dest, downloaded: false };
  }
  try {
    await writeDownload(await client.downloadFile(file), dest);
    return { ...fields, localPath: dest, downloaded: true };
  } catch (error) {
    return { ...fields, downloadError: errorText(error), downloaded: false };
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

async function syncOneCourse(
  client: CanvasClient,
  userId: string,
  providerId: string,
  course: CanvasCourse,
  assignments: CanvasAssignment[],
  now: Date
): Promise<{ materials: number; downloaded: number; links: number }> {
  const full = await client.getCourse(course.id);
  const courseRow = await prisma.course.upsert({
    where: { userId_canvasId: { userId, canvasId: String(course.id) } },
    create: {
      userId,
      canvasId: String(course.id),
      name: course.name,
      code: course.course_code ?? null,
      termName: full.term?.name ?? null,
      syllabusHtml: full.syllabus_body || null,
    },
    update: {
      name: course.name,
      code: course.course_code ?? null,
      termName: full.term?.name ?? null,
      syllabusHtml: full.syllabus_body || null,
    },
  });

  const previous = await prisma.courseMaterial.findMany({
    where: { courseId: courseRow.id },
    select: { canvasRef: true, fileUpdatedAt: true, localPath: true },
  });
  const previousByRef = new Map(previous.map((p) => [p.canvasRef, p]));

  const maps = assignmentIdMaps(assignments);
  const modules = await client.listModules(course.id);
  const seenModules: string[] = [];
  const seenRefs: string[] = [];
  let downloaded = 0;

  const upsertMaterial = async (
    item: PlannedItem,
    moduleId: string | null
  ): Promise<void> => {
    let bodyHtml: string | null = null;
    let locked = item.locked;
    let file: FileFields | null = null;

    if (item.kind === "PAGE" && item.pageSlug && !locked) {
      try {
        const page = await client.getPage(course.id, item.pageSlug);
        bodyHtml = page.body ?? null;
        locked = locked || Boolean(page.locked_for_user);
      } catch {
        locked = true; // hidden or unpublished to students
      }
    }
    if (item.kind === "FILE" && item.fileCanvasId) {
      const resolved = await resolveFile(
        client,
        course.id,
        item.fileCanvasId,
        previousByRef.get(item.canvasRef)
      );
      if (resolved.downloaded) downloaded += 1;
      file = {
        fileName: resolved.fileName,
        contentType: resolved.contentType,
        sizeBytes: resolved.sizeBytes,
        fileUpdatedAt: resolved.fileUpdatedAt,
        localPath: resolved.localPath,
        downloadError: resolved.downloadError,
        locked: resolved.locked,
      };
      locked = locked || resolved.locked;
    }

    const data = {
      // First, so the combined item+file `locked` below wins over the file's own.
      ...(file ?? {}),
      kind: item.kind,
      // A description-only file has no module title; its file name is the best one.
      title: moduleId == null && file?.fileName ? file.fileName : item.title,
      position: item.position,
      indent: item.indent,
      htmlUrl: item.htmlUrl,
      locked,
      pageSlug: item.pageSlug,
      bodyHtml,
      fileCanvasId: item.fileCanvasId,
      assignmentCanvasId: item.assignmentCanvasId,
      moduleId,
      lastSyncedAt: now,
    };
    await prisma.courseMaterial.upsert({
      where: { courseId_canvasRef: { courseId: courseRow.id, canvasRef: item.canvasRef } },
      create: { courseId: courseRow.id, canvasRef: item.canvasRef, ...data },
      update: data,
    });
    seenRefs.push(item.canvasRef);
  };

  const moduleFileIds = new Set<string>();
  const modulePageSlugs = new Set<string>();
  for (const m of modules) {
    const moduleRow = await prisma.courseModule.upsert({
      where: { courseId_canvasId: { courseId: courseRow.id, canvasId: String(m.id) } },
      create: {
        courseId: courseRow.id,
        canvasId: String(m.id),
        name: m.name,
        position: m.position,
        unlockAt: m.unlock_at ? new Date(m.unlock_at) : null,
      },
      update: {
        name: m.name,
        position: m.position,
        unlockAt: m.unlock_at ? new Date(m.unlock_at) : null,
      },
    });
    seenModules.push(moduleRow.id);
    for (const item of m.items ?? []) {
      const planned = planModuleItem(item, maps);
      if (!planned) continue;
      if (planned.fileCanvasId) moduleFileIds.add(planned.fileCanvasId);
      if (planned.pageSlug) modulePageSlugs.add(planned.pageSlug);
      await upsertMaterial(planned, moduleRow.id);
    }
  }

  // Files and pages an assignment links to that no module carries.
  const extraFiles = new Set<string>();
  const extraPages = new Set<string>();
  for (const a of assignments) {
    const refs = descriptionRefs(a.description, course.id);
    refs.fileIds.filter((id) => !moduleFileIds.has(id)).forEach((id) => extraFiles.add(id));
    refs.pageSlugs.filter((s) => !modulePageSlugs.has(s)).forEach((s) => extraPages.add(s));
  }
  const detached = (partial: Partial<PlannedItem> & Pick<PlannedItem, "canvasRef" | "kind" | "title">): PlannedItem => ({
    position: 0,
    indent: 0,
    htmlUrl: null,
    locked: false,
    fileCanvasId: null,
    pageSlug: null,
    assignmentCanvasId: null,
    ...partial,
  });
  for (const fileId of extraFiles) {
    await upsertMaterial(detached({ canvasRef: `file:${fileId}`, kind: "FILE", title: `File ${fileId}`, fileCanvasId: fileId }), null);
  }
  for (const slug of extraPages) {
    await upsertMaterial(detached({ canvasRef: `page:${slug}`, kind: "PAGE", title: slug, pageSlug: slug }), null);
  }
  await prisma.courseMaterial.deleteMany({
    where: { courseId: courseRow.id, canvasRef: { notIn: seenRefs } },
  });
  await prisma.courseModule.deleteMany({
    where: { courseId: courseRow.id, id: { notIn: seenModules } },
  });

  // Rebuild this course's task links from scratch — cheap, and never stale.
  const materials = await prisma.courseMaterial.findMany({
    where: { courseId: courseRow.id },
    select: {
      id: true,
      kind: true,
      moduleId: true,
      fileCanvasId: true,
      pageSlug: true,
      assignmentCanvasId: true,
    },
  });
  const planned = planTaskLinks(
    assignments,
    materials.map((m) => ({ ...m, kind: m.kind as PlannedItem["kind"] })),
    course.id
  );
  const tasks = await prisma.task.findMany({
    where: { userId, taskProviderId: providerId, courseId: String(course.id) },
    select: { id: true, externalTaskId: true },
  });
  const taskIdByExternal = new Map(tasks.map((t) => [t.externalTaskId, t.id]));
  const rows = planned.flatMap((l) => {
    const taskId = taskIdByExternal.get(l.taskExternalId);
    return taskId ? [{ taskId, materialId: l.materialId, reason: l.reason }] : [];
  });
  await prisma.$transaction([
    prisma.taskMaterialLink.deleteMany({ where: { taskId: { in: tasks.map((t) => t.id) } } }),
    prisma.taskMaterialLink.createMany({ data: rows, skipDuplicates: true }),
  ]);

  await prisma.course.update({ where: { id: courseRow.id }, data: { lastSyncedAt: now } });
  return { materials: materials.length, downloaded, links: rows.length };
}

/**
 * Mirror materials for the live courses the task sync just resolved. One
 * course failing is logged and skipped; the rest still sync. Courses no
 * longer live are removed (their cached files stay on disk).
 */
export async function syncCanvasMaterials(
  client: CanvasClient,
  userId: string,
  providerId: string,
  liveCourses: CanvasCourse[],
  assignmentsByCourse: Map<number, CanvasAssignment[]>,
  now: Date,
  options: { force?: boolean } = {}
): Promise<MaterialsSyncStats> {
  const stats: MaterialsSyncStats = {
    courses: 0,
    skippedFresh: 0,
    materials: 0,
    downloaded: 0,
    links: 0,
    failedCourses: 0,
  };

  const existing = await prisma.course.findMany({
    where: { userId },
    select: { canvasId: true, lastSyncedAt: true },
  });
  const lastSync = new Map(existing.map((c) => [c.canvasId, c.lastSyncedAt]));

  for (const course of liveCourses) {
    const last = lastSync.get(String(course.id));
    if (!options.force && last && now.getTime() - last.getTime() < MATERIALS_INTERVAL_MS) {
      stats.skippedFresh += 1;
      continue;
    }
    try {
      const result = await syncOneCourse(
        client,
        userId,
        providerId,
        course,
        assignmentsByCourse.get(course.id) ?? [],
        now
      );
      stats.courses += 1;
      stats.materials += result.materials;
      stats.downloaded += result.downloaded;
      stats.links += result.links;
    } catch (error) {
      stats.failedCourses += 1;
      logger.error(
        "Canvas materials sync failed for course",
        { userId, courseId: course.id, error: errorText(error) },
        LOG_SOURCE
      );
    }
  }

  await prisma.course.deleteMany({
    where: { userId, canvasId: { notIn: liveCourses.map((c) => String(c.id)) } },
  });

  logger.info("Canvas materials sync completed", { userId, ...stats }, LOG_SOURCE);
  return stats;
}
