/**
 * Pure planning for the Canvas materials mirror: what each module item
 * becomes, what an assignment description links to, and which materials a
 * task gets. No IO — `sync-canvas-materials.ts` fetches and writes.
 */
import type { CanvasAssignment, CanvasModuleItem } from "@/lib/canvas/types";

export type MaterialKind =
  | "FILE"
  | "PAGE"
  | "EXTERNAL_URL"
  | "EXTERNAL_TOOL"
  | "ASSIGNMENT"
  | "QUIZ"
  | "DISCUSSION"
  | "SUBHEADER";

const KIND_BY_ITEM_TYPE: Record<string, MaterialKind> = {
  File: "FILE",
  Page: "PAGE",
  ExternalUrl: "EXTERNAL_URL",
  ExternalTool: "EXTERNAL_TOOL",
  Assignment: "ASSIGNMENT",
  Quiz: "QUIZ",
  Discussion: "DISCUSSION",
  SubHeader: "SUBHEADER",
};

/** Kinds a student reads or opens — the ones worth attaching to a task. */
export const READABLE_KINDS: ReadonlySet<MaterialKind> = new Set([
  "FILE",
  "PAGE",
  "EXTERNAL_URL",
  "EXTERNAL_TOOL",
]);

export interface PlannedItem {
  canvasRef: string;
  kind: MaterialKind;
  title: string;
  position: number;
  indent: number;
  htmlUrl: string | null;
  locked: boolean;
  fileCanvasId: string | null;
  pageSlug: string | null;
  assignmentCanvasId: string | null;
}

/** Graded quizzes and discussions point at their assignment; module items only know the quiz/topic id. */
export function assignmentIdMaps(assignments: CanvasAssignment[]): {
  byQuiz: Map<number, number>;
  byTopic: Map<number, number>;
} {
  const byQuiz = new Map<number, number>();
  const byTopic = new Map<number, number>();
  for (const a of assignments) {
    if (a.quiz_id != null) byQuiz.set(a.quiz_id, a.id);
    if (a.discussion_topic?.id != null) byTopic.set(a.discussion_topic.id, a.id);
  }
  return { byQuiz, byTopic };
}

/** A module item as a material row, or null for item types Sigwald doesn't mirror. */
export function planModuleItem(
  item: CanvasModuleItem,
  maps: ReturnType<typeof assignmentIdMaps>
): PlannedItem | null {
  const kind = KIND_BY_ITEM_TYPE[item.type];
  if (!kind) {
    return null;
  }
  const contentId = item.content_id ?? null;
  let assignmentId: number | null = null;
  if (kind === "ASSIGNMENT") assignmentId = contentId;
  if (kind === "QUIZ" && contentId != null) assignmentId = maps.byQuiz.get(contentId) ?? null;
  if (kind === "DISCUSSION" && contentId != null) assignmentId = maps.byTopic.get(contentId) ?? null;

  return {
    canvasRef: `item:${item.id}`,
    kind,
    title: item.title,
    position: item.position,
    indent: item.indent ?? 0,
    htmlUrl: kind === "EXTERNAL_URL" ? (item.external_url ?? null) : (item.html_url ?? null),
    locked: Boolean(item.content_details?.locked_for_user),
    fileCanvasId: kind === "FILE" && contentId != null ? String(contentId) : null,
    pageSlug: kind === "PAGE" ? (item.page_url ?? null) : null,
    assignmentCanvasId: assignmentId != null ? String(assignmentId) : null,
  };
}

export interface LinkedRefs {
  fileIds: string[];
  pageSlugs: string[];
}

/**
 * Files and pages an HTML body links to: an assignment description, a page,
 * an announcement or the syllabus. Links only — an `<img>` embedded in the
 * body is decoration, not a reading.
 */
// Canvas rewrites embedded links to course-relative paths:
// /courses/123/files/456/download?..., /courses/123/pages/week-3-reading.
// Anchored to this course so a cross-course link isn't misattributed.
export function linkedRefs(html: string | null | undefined, courseId: number): LinkedRefs {
  if (!html) {
    return { fileIds: [], pageSlugs: [] };
  }
  const fileIds = new Set<string>();
  const pageSlugs = new Set<string>();
  const file = new RegExp(`/courses/${courseId}/files/(\\d+)`);
  const page = new RegExp(`/courses/${courseId}/pages/([A-Za-z0-9_\\-%.]+)`);
  for (const [, href] of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const f = href.match(file);
    if (f) fileIds.add(f[1]);
    const p = href.match(page);
    if (p) {
      try {
        pageSlugs.add(decodeURIComponent(p[1]));
      } catch {
        pageSlugs.add(p[1]);
      }
    }
  }
  return { fileIds: [...fileIds], pageSlugs: [...pageSlugs] };
}

export interface MaterialForLinking {
  id: string;
  kind: MaterialKind;
  moduleId: string | null;
  fileCanvasId: string | null;
  pageSlug: string | null;
  assignmentCanvasId: string | null;
}

export interface PlannedLink {
  taskExternalId: string;
  materialId: string;
  reason: "MODULE" | "DESCRIPTION";
}

/**
 * Links for every assignment: what its description points at (reason
 * DESCRIPTION, which wins), plus the readable materials in the module(s)
 * the assignment sits in (reason MODULE). One link per (task, material).
 */
export function planTaskLinks(
  assignments: CanvasAssignment[],
  materials: MaterialForLinking[],
  courseId: number
): PlannedLink[] {
  const modulesByAssignment = new Map<string, Set<string>>();
  const readableByModule = new Map<string, string[]>();
  const byFile = new Map<string, string[]>();
  const byPage = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, id: string) => {
    const list = map.get(key);
    if (list) list.push(id);
    else map.set(key, [id]);
  };

  for (const m of materials) {
    if (m.assignmentCanvasId && m.moduleId) {
      const set = modulesByAssignment.get(m.assignmentCanvasId) ?? new Set<string>();
      set.add(m.moduleId);
      modulesByAssignment.set(m.assignmentCanvasId, set);
    }
    if (READABLE_KINDS.has(m.kind) && m.moduleId) push(readableByModule, m.moduleId, m.id);
    if (m.fileCanvasId) push(byFile, m.fileCanvasId, m.id);
    if (m.pageSlug) push(byPage, m.pageSlug, m.id);
  }

  const links: PlannedLink[] = [];
  for (const a of assignments) {
    const taskExternalId = String(a.id);
    const seen = new Set<string>();
    const add = (materialId: string, reason: PlannedLink["reason"]) => {
      if (seen.has(materialId)) return;
      seen.add(materialId);
      links.push({ taskExternalId, materialId, reason });
    };
    const refs = linkedRefs(a.description, courseId);
    for (const fileId of refs.fileIds) for (const id of byFile.get(fileId) ?? []) add(id, "DESCRIPTION");
    for (const slug of refs.pageSlugs) for (const id of byPage.get(slug) ?? []) add(id, "DESCRIPTION");
    for (const moduleId of modulesByAssignment.get(taskExternalId) ?? []) {
      for (const id of readableByModule.get(moduleId) ?? []) add(id, "MODULE");
    }
  }
  return links;
}
