import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { pruneCourseFolder } from "../canvas/material-files";

describe("pruneCourseFolder", () => {
  let root: string;
  const previous = process.env.SIGWALD_MATERIALS_DIR;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "sigwald-materials-"));
    process.env.SIGWALD_MATERIALS_DIR = root;
  });

  afterEach(async () => {
    process.env.SIGWALD_MATERIALS_DIR = previous;
    await rm(root, { recursive: true, force: true });
  });

  it("removes only Sigwald's unreferenced files, leftovers included", async () => {
    const dir = path.join(root, "265615");
    await mkdir(dir, { recursive: true });
    for (const name of ["101-slides.pdf", "102-old.png", "103-study guide.docx.partial", "notes.txt"]) {
      await writeFile(path.join(dir, name), "x");
    }
    const removed = await pruneCourseFolder("265615", new Set([path.join(dir, "101-slides.pdf")]));
    expect(removed).toBe(2);
    expect((await readdir(dir)).sort()).toEqual(["101-slides.pdf", "notes.txt"]);
  });

  it("is a no-op for a course with no folder yet", async () => {
    await expect(pruneCourseFolder("999", new Set())).resolves.toBe(0);
  });
});
