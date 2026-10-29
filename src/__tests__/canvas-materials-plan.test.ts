import {
  type MaterialForLinking,
  assignmentIdMaps,
  linkedRefs,
  planModuleItem,
  planTaskLinks,
} from "@/lib/canvas/materials-plan";
import type { CanvasAssignment, CanvasModuleItem } from "@/lib/canvas/types";

const COURSE = 101;

function assignment(partial: Partial<CanvasAssignment> & { id: number }): CanvasAssignment {
  return { name: `A${partial.id}`, course_id: COURSE, ...partial };
}

function item(partial: Partial<CanvasModuleItem> & { id: number; type: string }): CanvasModuleItem {
  return { title: `Item ${partial.id}`, position: 1, ...partial };
}

describe("planModuleItem", () => {
  const maps = assignmentIdMaps([
    assignment({ id: 900, quiz_id: 55 }),
    assignment({ id: 901, discussion_topic: { id: 66 } }),
  ]);

  it("maps a file item to its file id and a stable item ref", () => {
    const planned = planModuleItem(item({ id: 7, type: "File", content_id: 4242 }), maps);
    expect(planned).toMatchObject({ canvasRef: "item:7", kind: "FILE", fileCanvasId: "4242" });
  });

  it("resolves graded quizzes and discussions to their backing assignment", () => {
    expect(planModuleItem(item({ id: 1, type: "Quiz", content_id: 55 }), maps)?.assignmentCanvasId).toBe("900");
    expect(planModuleItem(item({ id: 2, type: "Discussion", content_id: 66 }), maps)?.assignmentCanvasId).toBe("901");
    expect(planModuleItem(item({ id: 3, type: "Quiz", content_id: 77 }), maps)?.assignmentCanvasId).toBeNull();
  });

  it("uses the external url for link items and flags locked content", () => {
    const planned = planModuleItem(
      item({
        id: 4,
        type: "ExternalUrl",
        external_url: "https://example.com/reading",
        html_url: "https://canvas/items/4",
        content_details: { locked_for_user: true },
      }),
      maps
    );
    expect(planned).toMatchObject({ htmlUrl: "https://example.com/reading", locked: true });
  });

  it("skips item types Sigwald doesn't mirror", () => {
    expect(planModuleItem(item({ id: 5, type: "SomethingNew" }), maps)).toBeNull();
  });
});

describe("linkedRefs", () => {
  it("finds this course's file and page links, deduplicated", () => {
    const html = `
      <a href="https://nu.instructure.com/courses/101/files/555/download?wrap=1">slides</a>
      <img src="/courses/101/files/555/preview">
      <a href="/courses/101/pages/week-3%20reading">page</a>
      <a href="/courses/999/files/777">other course</a>`;
    expect(linkedRefs(html, COURSE)).toEqual({
      fileIds: ["555"],
      pageSlugs: ["week-3 reading"],
    });
  });

  it("ignores images embedded in the body", () => {
    expect(linkedRefs(`<p><img src="/courses/101/files/888/preview" alt=""></p>`, COURSE).fileIds).toEqual([]);
  });

  it("handles an empty description", () => {
    expect(linkedRefs(null, COURSE)).toEqual({ fileIds: [], pageSlugs: [] });
  });
});

describe("planTaskLinks", () => {
  const materials: MaterialForLinking[] = [
    { id: "hw-item", kind: "ASSIGNMENT", moduleId: "m1", fileCanvasId: null, pageSlug: null, assignmentCanvasId: "10" },
    { id: "slides", kind: "FILE", moduleId: "m1", fileCanvasId: "555", pageSlug: null, assignmentCanvasId: null },
    { id: "reading", kind: "PAGE", moduleId: "m1", fileCanvasId: null, pageSlug: "week-1", assignmentCanvasId: null },
    { id: "header", kind: "SUBHEADER", moduleId: "m1", fileCanvasId: null, pageSlug: null, assignmentCanvasId: null },
    { id: "other-week", kind: "FILE", moduleId: "m2", fileCanvasId: "556", pageSlug: null, assignmentCanvasId: null },
    { id: "loose-file", kind: "FILE", moduleId: null, fileCanvasId: "999", pageSlug: null, assignmentCanvasId: null },
  ];

  it("links an assignment to its module's readable materials", () => {
    const links = planTaskLinks([assignment({ id: 10 })], materials, COURSE);
    expect(links.map((l) => [l.materialId, l.reason])).toEqual([
      ["slides", "MODULE"],
      ["reading", "MODULE"],
    ]);
  });

  it("prefers the description reason and never duplicates a material", () => {
    const hw = assignment({
      id: 10,
      description: '<a href="/courses/101/files/555">slides</a> <a href="/courses/101/files/999">x</a>',
    });
    const links = planTaskLinks([hw], materials, COURSE);
    expect(links.map((l) => [l.materialId, l.reason])).toEqual([
      ["slides", "DESCRIPTION"],
      ["loose-file", "DESCRIPTION"],
      ["reading", "MODULE"],
    ]);
  });

  it("gives an assignment outside every module only its description links", () => {
    const links = planTaskLinks([assignment({ id: 11 })], materials, COURSE);
    expect(links).toEqual([]);
  });
});
