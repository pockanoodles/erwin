import {
  buildRows,
  firstSelectable,
  indexOfMaterial,
  stepSelectable,
} from "@/components/courses/library-rows";
import type { LibraryCourse, LibraryMaterial } from "@/types/course-materials";

const material = (id: string, over: Partial<LibraryMaterial> = {}): LibraryMaterial => ({
  id,
  kind: "PAGE",
  title: id,
  position: 1,
  indent: 0,
  htmlUrl: null,
  locked: false,
  fileName: null,
  contentType: null,
  sizeBytes: null,
  downloadError: null,
  cached: false,
  assignmentCanvasId: null,
  moduleId: "m1",
  task: null,
  nextTask: null,
  openTaskCount: 0,
  ...over,
});

const course: LibraryCourse = {
  id: "c1",
  canvasId: "1",
  code: "INTB1203",
  name: "INTB 1203",
  termName: null,
  lastSyncedAt: null,
  hasSyllabus: true,
  modules: [
    {
      id: "m1",
      name: "Module 1",
      position: 1,
      unlockAt: null,
      materials: [
        material("heading", { kind: "SUBHEADER" }),
        material("reading", { openTaskCount: 1, nextTask: { id: "t1", title: "Essay", dueDate: null } }),
        material("old slides", { kind: "FILE", fileName: "old.pdf" }),
      ],
    },
    {
      id: "m2",
      name: "Module 2",
      position: 2,
      unlockAt: null,
      materials: [material("quiz", { kind: "QUIZ", task: { id: "t2", dueDate: null, status: "completed" } })],
    },
  ],
  unfiled: [material("cited", { moduleId: null, openTaskCount: 2 })],
};

const all = { search: "", forOpenTasks: false };

describe("buildRows", () => {
  it("lays out syllabus, module bands with their items, then unfiled", () => {
    expect(buildRows(course, all).map((r) => r.type + ":" + r.key)).toEqual([
      "syllabus:syllabus:c1",
      "module:m1",
      "subheader:heading",
      "item:reading",
      "item:old slides",
      "module:m2",
      "item:quiz",
      "module:unfiled:c1",
      "item:cited",
    ]);
  });

  it("keeps only what open tasks need, dropping empty bands, subheaders and the syllabus", () => {
    const keys = buildRows(course, { search: "", forOpenTasks: true }).map((r) => r.key);
    expect(keys).toEqual(["m1", "reading", "unfiled:c1", "cited"]);
  });

  it("searches titles, file names and the linked task", () => {
    expect(buildRows(course, { search: "old.pdf", forOpenTasks: false }).map((r) => r.key)).toEqual([
      "m1",
      "old slides",
    ]);
    expect(buildRows(course, { search: "essay", forOpenTasks: false }).map((r) => r.key)).toEqual([
      "m1",
      "reading",
    ]);
  });
});

describe("selection helpers", () => {
  const rows = buildRows(course, all);

  it("steps over bands and subheaders and stops at the ends", () => {
    expect(firstSelectable(rows)).toBe(0);
    expect(stepSelectable(rows, 0, 1)).toBe(3);
    expect(stepSelectable(rows, 4, 1)).toBe(6);
    expect(stepSelectable(rows, 8, 1)).toBe(8);
    expect(stepSelectable(rows, 0, -1)).toBe(0);
  });

  it("finds a material's row", () => {
    expect(indexOfMaterial(rows, "cited")).toBe(8);
    expect(indexOfMaterial(rows, "missing")).toBe(-1);
  });
});
