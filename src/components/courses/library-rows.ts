/**
 * A course's library flattened into sheet rows, in Canvas order: the
 * syllabus, then each module as a band with its items, then anything only an
 * assignment description links to. Pure, so the filters can be tested.
 */
import type { LibraryCourse, LibraryMaterial } from "@/types/course-materials";

export type LibraryRow =
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
    for (const m of materials) {
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
  if (course.unfiled.length) band(`unfiled:${course.id}`, "Linked from assignments", null, course.unfiled);

  return rows;
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
