/**
 * Canvas materials mirror for one course: the syllabus, modules, module items
 * (files, pages, links, graded work), files a module page links to, plus files
 * and pages reached only from an assignment, an announcement or the syllabus —
 * and the task ↔ material links between them.
 *
 * Runs every sync, in one of two depths. Incremental (most ticks) re-reads the
 * module structure and fetches only what's new or newly unlocked, so a file
 * posted at 9:00 is in Sigwald by 9:15. Full (every MATERIALS_FULL_INTERVAL, or
 * forced) also re-reads every page body and file's metadata, which is how an
 * edited page or a replaced file is noticed; files re-download only when
 * Canvas reports a newer `updated_at`. Canvas is the source of truth: anything
 * it no longer returns is pruned.
 */
import { stat } from "node:fs/promises";

import {
  type ActivityDraft,
  bodyText,
  fingerprint,
} from "@/lib/canvas/activity-plan";
import type { CanvasClient } from "@/lib/canvas/canvas-client";
import {
  linkCourseFolder,
  localPathFor,
  maxFileBytes,
  pruneCourseFolder,
  writeDownload,
} from "@/lib/canvas/material-files";
import {
  type PlannedItem,
  READABLE_KINDS,
  assignmentIdMaps,
  linkedRefs,
  planModuleItem,
  planTaskLinks,
} from "@/lib/canvas/materials-plan";
import type { CanvasAssignment, CanvasCourse } from "@/lib/canvas/types";
import { prisma } from "@/lib/prisma";

/** How often a course gets the full pass. */
export const MATERIALS_FULL_INTERVAL_MS = 6 * 3_600_000;

export interface MaterialsSyncStats {
  courses: number;
  fullPasses: number;
  materials: number;
  downloaded: number;
  links: number;
  failedCourses: number;
}

export interface CourseMaterialsResult {
  materials: number;
  downloaded: number;
  links: number;
  activity: ActivityDraft[];
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

const PREVIOUS_FIELDS = {
  id: true,
  canvasRef: true,
  title: true,
  locked: true,
  bodyHtml: true,
  fileCanvasId: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  fileUpdatedAt: true,
  localPath: true,
  downloadError: true,
} as const;

type PreviousMaterial = {
  id: string;
  canvasRef: string;
  title: string;
  locked: boolean;
  bodyHtml: string | null;
  fileCanvasId: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  fileUpdatedAt: Date | null;
  localPath: string | null;
  downloadError: string | null;
};

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
  const onDisk = await stat(dest).catch(() => null);
  const unchanged =
    onDisk != null &&
    ((previous?.localPath === dest &&
      previous.fileUpdatedAt?.getTime() === fields.fileUpdatedAt?.getTime()) ||
      // Cached by a sync this database doesn't remember (a restore, a rebuilt
      // database on the same disk): same size, written after Canvas last changed it.
      (onDisk.size === file.size &&
        fields.fileUpdatedAt != null &&
        onDisk.mtime.getTime() >= fields.fileUpdatedAt.getTime()));
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

const detached = (
  partial: Partial<PlannedItem> & Pick<PlannedItem, "canvasRef" | "kind" | "title">
): PlannedItem => ({
  position: 0,
  indent: 0,
  htmlUrl: null,
  locked: false,
  fileCanvasId: null,
  pageSlug: null,
  assignmentCanvasId: null,
  ...partial,
});

export async function syncCourseMaterials(
  client: CanvasClient,
  userId: string,
  providerId: string,
  courseRow: { id: string; syllabusHtml: string | null; code: string | null },
  course: CanvasCourse,
  assignments: CanvasAssignment[],
  now: Date,
  options: { full: boolean }
): Promise<CourseMaterialsResult> {
  const { full } = options;
  const activity: ActivityDraft[] = [];

  let syllabusHtml = courseRow.syllabusHtml;
  if (full) {
    const fresh = (await client.getCourse(course.id)).syllabus_body || null;
    const before = bodyText(syllabusHtml);
    const after = bodyText(fresh);
    if (before && after && before !== after) {
      activity.push({
        kind: "SYLLABUS_CHANGED",
        title: "Syllabus",
        detail: "Edited in Canvas",
        dedupeKey: `syllabus:${fingerprint(after)}`,
        occurredAt: now,
      });
    }
    syllabusHtml = fresh;
    await prisma.course.update({ where: { id: courseRow.id }, data: { syllabusHtml } });
    await linkCourseFolder(String(course.id), courseRow.code);
  }

  const previous: PreviousMaterial[] = await prisma.courseMaterial.findMany({
    where: { courseId: courseRow.id },
    select: PREVIOUS_FIELDS,
  });
  const previousByRef = new Map(previous.map((p) => [p.canvasRef, p]));

  const maps = assignmentIdMaps(assignments);
  const modules = await client.listModules(course.id);
  const planned = modules.map((m) => ({
    module: m,
    items: (m.items ?? []).flatMap((item) => {
      const plan = planModuleItem(item, maps);
      return plan ? [plan] : [];
    }),
  }));
  const moduleFileIds = new Set(planned.flatMap((p) => p.items.flatMap((i) => (i.fileCanvasId ? [i.fileCanvasId] : []))));
  const modulePageSlugs = new Set(planned.flatMap((p) => p.items.flatMap((i) => (i.pageSlug ? [i.pageSlug] : []))));

  const seenRefs = new Set<string>();
  const seenModules: string[] = [];
  let downloaded = 0;

  /**
   * Write one material. Content (a page body, a file's metadata and bytes) is
   * fetched on a full pass, for anything new or newly unlocked, and otherwise
   * carried over from the last sync.
   */
  const upsertMaterial = async (
    item: PlannedItem,
    placement: { moduleId: string | null; moduleName: string | null; parentId: string | null }
  ): Promise<{ id: string; bodyHtml: string | null }> => {
    const prev = previousByRef.get(item.canvasRef);
    const refetch =
      full ||
      !prev ||
      (prev.locked && !item.locked) ||
      (item.fileCanvasId != null && prev.fileCanvasId !== item.fileCanvasId);

    let bodyHtml: string | null = prev?.bodyHtml ?? null;
    let pageTitle: string | null = null;
    let locked = item.locked;
    let file: FileFields | null = null;
    let fileWasReplaced = false;

    if (item.kind === "PAGE" && item.pageSlug && !item.locked && refetch) {
      try {
        const page = await client.getPage(course.id, item.pageSlug);
        bodyHtml = page.body ?? null;
        pageTitle = page.title;
        locked = Boolean(page.locked_for_user);
      } catch {
        locked = true; // hidden or unpublished to students
      }
    }

    if (item.kind === "FILE" && item.fileCanvasId) {
      if (refetch) {
        const resolved = await resolveFile(client, course.id, item.fileCanvasId, prev);
        if (resolved.downloaded) {
          downloaded += 1;
          fileWasReplaced =
            prev?.localPath != null &&
            prev.fileUpdatedAt != null &&
            resolved.fileUpdatedAt != null &&
            resolved.fileUpdatedAt.getTime() > prev.fileUpdatedAt.getTime();
        }
        file = {
          fileName: resolved.fileName,
          contentType: resolved.contentType,
          sizeBytes: resolved.sizeBytes,
          fileUpdatedAt: resolved.fileUpdatedAt,
          localPath: resolved.localPath,
          downloadError: resolved.downloadError,
          locked: resolved.locked,
        };
      } else if (prev) {
        file = {
          fileName: prev.fileName,
          contentType: prev.contentType,
          sizeBytes: prev.sizeBytes,
          fileUpdatedAt: prev.fileUpdatedAt,
          localPath: prev.localPath,
          downloadError: prev.downloadError,
          locked: prev.locked,
        };
      }
      locked = locked || Boolean(file?.locked);
    }

    // Only module items carry a title of their own. A linked file is named by
    // its file name, a linked page by its page title.
    const title =
      placement.moduleId != null && placement.parentId == null
        ? item.title
        : (file?.fileName ?? pageTitle ?? prev?.title ?? item.title);
    const data = {
      // First, so the combined item+file `locked` below wins over the file's own.
      ...(file ?? {}),
      kind: item.kind,
      title,
      position: item.position,
      indent: item.indent,
      htmlUrl: item.htmlUrl,
      locked,
      pageSlug: item.pageSlug,
      bodyHtml,
      fileCanvasId: item.fileCanvasId,
      assignmentCanvasId: item.assignmentCanvasId,
      moduleId: placement.moduleId,
      parentId: placement.parentId,
      lastSyncedAt: now,
    };
    const row = await prisma.courseMaterial.upsert({
      where: { courseId_canvasRef: { courseId: courseRow.id, canvasRef: item.canvasRef } },
      create: { courseId: courseRow.id, canvasRef: item.canvasRef, ...data },
      update: data,
      select: { id: true },
    });
    seenRefs.add(item.canvasRef);

    if (READABLE_KINDS.has(item.kind) && !locked) {
      const target = { materialRef: item.canvasRef };
      if (!prev || prev.locked) {
        activity.push({
          kind: "MATERIAL_NEW",
          title,
          detail: placement.moduleName,
          dedupeKey: `material:${item.canvasRef}`,
          occurredAt: now,
          target,
        });
      } else if (fileWasReplaced && file?.fileUpdatedAt) {
        activity.push({
          kind: "MATERIAL_UPDATED",
          title,
          detail: "New version of the file",
          dedupeKey: `material:${item.canvasRef}:${file.fileUpdatedAt.toISOString()}`,
          occurredAt: file.fileUpdatedAt,
          target,
        });
      } else if (item.kind === "PAGE" && refetch) {
        const before = bodyText(prev.bodyHtml);
        const after = bodyText(bodyHtml);
        if (before && after && before !== after) {
          activity.push({
            kind: "MATERIAL_UPDATED",
            title,
            detail: "Page edited",
            dedupeKey: `material:${item.canvasRef}:${fingerprint(after)}`,
            occurredAt: now,
            target,
          });
        }
      }
    }
    return { id: row.id, bodyHtml };
  };

  const pageLinkedFileIds = new Set<string>();
  for (const { module: m, items } of planned) {
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
    const placement = { moduleId: moduleRow.id, moduleName: m.name, parentId: null };
    for (const item of items) {
      const written = await upsertMaterial(item, placement);
      if (item.kind !== "PAGE") {
        continue;
      }
      // SCHM wraps its slides in pages: the files a page links to belong to
      // its module, listed under the page.
      for (const fileId of linkedRefs(written.bodyHtml, course.id).fileIds) {
        if (moduleFileIds.has(fileId) || pageLinkedFileIds.has(fileId)) {
          continue;
        }
        pageLinkedFileIds.add(fileId);
        await upsertMaterial(
          detached({
            canvasRef: `file:${fileId}`,
            kind: "FILE",
            title: `File ${fileId}`,
            fileCanvasId: fileId,
            position: item.position,
            indent: item.indent + 1,
          }),
          { ...placement, parentId: written.id }
        );
      }
    }
  }

  // Files and pages that only an assignment, an announcement or the syllabus links to.
  const announcements = await prisma.courseAnnouncement.findMany({
    where: { courseId: courseRow.id },
    select: { bodyHtml: true },
  });
  const extraFiles = new Set<string>();
  const extraPages = new Set<string>();
  for (const html of [
    ...assignments.map((a) => a.description),
    ...announcements.map((a) => a.bodyHtml),
    syllabusHtml,
  ]) {
    const refs = linkedRefs(html, course.id);
    refs.fileIds
      .filter((id) => !moduleFileIds.has(id) && !pageLinkedFileIds.has(id))
      .forEach((id) => extraFiles.add(id));
    refs.pageSlugs.filter((s) => !modulePageSlugs.has(s)).forEach((s) => extraPages.add(s));
  }
  const unfiled = { moduleId: null, moduleName: null, parentId: null };
  for (const fileId of extraFiles) {
    await upsertMaterial(
      detached({ canvasRef: `file:${fileId}`, kind: "FILE", title: `File ${fileId}`, fileCanvasId: fileId }),
      unfiled
    );
  }
  for (const slug of extraPages) {
    await upsertMaterial(detached({ canvasRef: `page:${slug}`, kind: "PAGE", title: slug, pageSlug: slug }), unfiled);
  }

  await prisma.courseMaterial.deleteMany({
    where: { courseId: courseRow.id, canvasRef: { notIn: [...seenRefs] } },
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
  const plannedLinks = planTaskLinks(
    assignments,
    materials.map((m) => ({ ...m, kind: m.kind as PlannedItem["kind"] })),
    course.id
  );
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      taskProviderId: providerId,
      courseAssignment: { course: { userId, canvasId: String(course.id) } },
    },
    select: { id: true, externalTaskId: true },
  });
  const taskIdByExternal = new Map(tasks.map((t) => [t.externalTaskId, t.id]));
  const rows = plannedLinks.flatMap((l) => {
    const taskId = taskIdByExternal.get(l.taskExternalId);
    return taskId ? [{ taskId, materialId: l.materialId, reason: l.reason }] : [];
  });
  await prisma.$transaction([
    prisma.taskMaterialLink.deleteMany({ where: { taskId: { in: tasks.map((t) => t.id) } } }),
    prisma.taskMaterialLink.createMany({ data: rows, skipDuplicates: true }),
  ]);

  if (full) {
    // Files are shared by every row that points at them, so prune by what's still referenced.
    const cached = await prisma.courseMaterial.findMany({
      where: { courseId: courseRow.id, localPath: { not: null } },
      select: { localPath: true },
    });
    await pruneCourseFolder(String(course.id), new Set(cached.map((m) => m.localPath!)));
    await prisma.course.update({ where: { id: courseRow.id }, data: { materialsSyncedAt: now } });
  }
  return { materials: materials.length, downloaded, links: rows.length, activity };
}
