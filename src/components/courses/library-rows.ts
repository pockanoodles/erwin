/**
 * A course's library flattened into sheet rows, in Canvas order: the
 * syllabus, then each module as a band with its items (a file a page links to
 * right under that page), then anything only an assignment, announcement or
 * the syllabus links to. Pure, so the filters can be tested.
 */
import type { LibraryCourse, LibraryMaterial } from "@/types/course-materials";

export type LibraryRow =
  | { type: "course"; key: string; course: LibraryCourse }
  | { type: "syllabus"; key: string }
  | { type: "module"; key: string; name: string; count: number; unlockAt: string | null }
  | { type: "subheader"; key: string; title: string; indent: number }
  | { type: "item"; key: string; material: LibraryMaterial; moduleName: string | null };

export interface RowFilter {
  search: string;
  /** Only what an open task needs: linked materials and open assignments. */
  forOpenTasks: boolean;
}

export const isSelectable = (row: LibraryRow) => row.type === "syllabus" || row.type === "item";

export function isForOpenTask(m: LibraryMaterial): boolean {
  return m.openTaskCount > 0 || (m.task != null && m.task.status !== "completed");
}

function matches(m: LibraryMaterial, moduleName: string | null, f: RowFilter): boolean {
  if (f.forOpenTasks && !isForOpenTask(m)) return false;
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  return [m.title, m.fileName, moduleName, m.nextTask?.title]
    .some((s) => s?.toLowerCase().includes(q));
}

export function buildRows(course: LibraryCourse, f: RowFilter): LibraryRow[] {
  const rows: LibraryRow[] = [];
  const filtering = f.forOpenTasks || f.search.trim() !== "";

  if (course.hasSyllabus && !filtering) {
    rows.push({ type: "syllabus", key: `syllabus:${course.id}` });
  }

  const band = (key: string, name: string, unlockAt: string | null, materials: LibraryMaterial[]) => {
    const items: LibraryRow[] = [];
    for (const m of underParents(materials)) {
      if (m.kind === "SUBHEADER") {
        // A subheader is Canvas's in-module heading; filtered views drop it
        // since the items it headed may be gone.
        if (!filtering) items.push({ type: "subheader", key: m.id, title: m.title, indent: m.indent });
        continue;
      }
      if (matches(m, name, f)) items.push({ type: "item", key: m.id, material: m, moduleName: name });
    }
    const count = items.filter((r) => r.type === "item").length;
    if (filtering && count === 0) return;
    rows.push({ type: "module", key, name, count, unlockAt }, ...items);
  };

  for (const mod of course.modules) band(mod.id, mod.name, mod.unlockAt, mod.materials);
  if (course.unfiled.length) {
    band(`unfiled:${course.id}`, "Linked from assignments and announcements", null, course.unfiled);
  }

  return rows;
}

/** Module order, with each linked file moved to just after the page that links to it. */
function underParents(materials: LibraryMaterial[]): LibraryMaterial[] {
  const ids = new Set(materials.map((m) => m.id));
  const children = new Map<string, LibraryMaterial[]>();
  for (const m of materials) {
    if (m.parentId && ids.has(m.parentId)) {
      children.set(m.parentId, [...(children.get(m.parentId) ?? []), m]);
    }
  }
  return materials
    .filter((m) => !m.parentId || !ids.has(m.parentId))
    .flatMap((m) => [m, ...(children.get(m.id) ?? [])]);
}

/** A row and the course it belongs to — the All tab mixes courses. */
export interface CourseRow {
  row: LibraryRow;
  course: LibraryCourse;
}

/**
 * Rows for one course, or for several under a band per course (the All tab;
 * a course with nothing left after filtering drops out).
 */
export function buildLibraryRows(courses: LibraryCourse[], f: RowFilter): CourseRow[] {
  if (courses.length === 1) {
    return buildRows(courses[0], f).map((row) => ({ row, course: courses[0] }));
  }
  return courses.flatMap((course) => {
    const rows = buildRows(course, f);
    if (rows.length === 0) return [];
    return [{ type: "course" as const, key: `course:${course.id}`, course }, ...rows].map((row) => ({ row, course }));
  });
}

/** Row index of a material, or -1. */
export function indexOfMaterial(rows: LibraryRow[], materialId: string): number {
  return rows.findIndex((r) => r.type === "item" && r.material.id === materialId);
}

/** The next selectable row from `from` in direction `step`, clamped to the ends. */
export function stepSelectable(rows: LibraryRow[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < rows.length; i += step) {
    if (isSelectable(rows[i])) return i;
  }
  return from;
}

export function firstSelectable(rows: LibraryRow[]): number {
  return rows.findIndex(isSelectable);
}
