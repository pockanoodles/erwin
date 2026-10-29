import { cleanCanvasHtml, NO_TARGETS, type CleanOptions } from "@/lib/canvas/clean-html";

const BASE = "https://school.instructure.com";

const opts = (over: Partial<CleanOptions> = {}): CleanOptions => ({
  courseCanvasId: "123",
  canvasBaseUrl: BASE,
  targets: {
    files: new Map([["456", "mat-file"]]),
    pages: new Map([["week-3-reading", "mat-page"]]),
  },
  ...over,
});

describe("cleanCanvasHtml", () => {
  it("strips scripts, handlers, styles and iframes", () => {
    const out = cleanCanvasHtml(
      '<p style="color:red" onclick="x()">Hi<script>alert(1)</script></p><iframe src="https://x"></iframe>',
      opts()
    );
    expect(out).toBe("<p>Hi</p>");
  });

  it("points a cached course file at the local copy", () => {
    const out = cleanCanvasHtml(
      `<a href="${BASE}/courses/123/files/456/download?wrap=1">Slides</a>`,
      opts()
    );
    expect(out).toBe('<a href="/api/sigwald/materials/mat-file/file" target="_blank">Slides</a>');
  });

  it("points a mirrored page at the library, including relative and encoded links", () => {
    const out = cleanCanvasHtml('<a href="/courses/123/pages/week%2D3-reading">Read</a>', opts());
    expect(out).toBe('<a href="/courses?m=mat-page">Read</a>');
  });

  it("absolutizes other Canvas links and opens them in a new tab", () => {
    const out = cleanCanvasHtml('<a href="/courses/123/files/999">Old</a>', opts());
    expect(out).toBe(
      `<a href="${BASE}/courses/123/files/999" target="_blank" rel="noopener noreferrer">Old</a>`
    );
  });

  it("leaves another course's file on Canvas", () => {
    const out = cleanCanvasHtml(`<a href="${BASE}/courses/77/files/456">X</a>`, opts());
    expect(out).toContain(`href="${BASE}/courses/77/files/456"`);
  });

  it("unwraps javascript: links and drops images Canvas would need auth for", () => {
    const out = cleanCanvasHtml(
      '<a href="javascript:alert(1)">x</a><img src="/courses/123/files/999/preview"><img src="/courses/123/files/456/preview" alt="d">',
      opts()
    );
    expect(out).toBe('<span>x</span><img src="/api/sigwald/materials/mat-file/file" alt="d" />');
  });

  it("demotes h1 and handles empty input", () => {
    expect(cleanCanvasHtml("<h1>T</h1>", opts({ targets: NO_TARGETS }))).toBe("<h2>T</h2>");
    expect(cleanCanvasHtml(null, opts())).toBe("");
  });
});
