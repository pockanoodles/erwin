/**
 * The module boundary, enforced. Code outside a module may reach it only
 * through the registries (src/modules/{index,client,server,hooks}.ts); a
 * module's own route files under src/app belong to it.
 *
 * Some couplings are older than the boundary. They're listed in KNOWN with
 * what removes each one, and the list can only shrink: a new coupling fails
 * this test, and so does a listed one that's gone (delete its line).
 */
import fs from "node:fs";
import path from "node:path";

/** What each module owns, by path prefix. Courses and Ladder predate src/modules. */
const OWNED: Record<string, string[]> = {
  courses: [
    "src/modules/courses/",
    "src/components/courses/",
    "src/components/packet/",
    "src/components/settings/CanvasLmsSettings.tsx",
    "src/lib/canvas/",
    "src/lib/erwin/gradebook.ts",
    "src/lib/erwin/grade-projection.ts",
    "src/lib/erwin/load-grade-projections.ts",
    "src/store/courseLibrary.ts",
    "src/store/courseActivity.ts",
    "src/store/materialCounts.ts",
    "src/types/course-activity.ts",
    "src/types/course-materials.ts",
    "src/types/gradebook.ts",
    "src/app/(common)/courses/",
    "src/app/api/erwin/canvas/",
    "src/app/api/erwin/courses/",
    "src/app/api/erwin/grades/",
    "src/app/api/erwin/materials/",
    "src/app/api/erwin/news/",
    "src/app/api/erwin/activity/",
    "src/app/api/erwin/tasks/[id]/materials/",
    "src/app/api/erwin/tasks/material-counts/",
  ],
  ladder: [
    "src/modules/ladder/",
    "src/components/ladder/",
    "src/components/goals/",
    "src/lib/erwin/boss-proof.ts",
    "src/lib/erwin/goal-cycles.ts",
    "src/lib/erwin/goal-input.ts",
    "src/lib/erwin/goal-links.ts",
    "src/lib/erwin/goal-rules.ts",
    "src/lib/erwin/hex.ts",
    "src/lib/erwin/ladder.ts",
    "src/lib/erwin/stats.ts",
    "src/lib/erwin/xp.ts",
    "src/lib/erwin/xp-report.ts",
    "src/store/ladder.ts",
    "src/store/lord.ts",
    "src/types/ladder.ts",
    "src/app/(common)/goals/",
    "src/app/api/erwin/goals/",
    "src/app/api/erwin/ladder/",
    "src/app/api/erwin/cycles/",
    "src/app/api/erwin/xp/",
    "src/app/api/erwin/task-links/",
  ],
  people: [
    "src/modules/people/",
    "src/app/(common)/people/",
    "src/app/api/erwin/people/",
  ],
};

const REGISTRIES = new Set([
  "src/modules/index.ts",
  "src/modules/client.tsx",
  "src/modules/server.ts",
  "src/modules/hooks.ts",
]);

/** "<importing file> -> <module>", each with what will remove it. */
const KNOWN = new Set([
  // The ranking engine reads Canvas's submission states and grade weights
  // straight off Task. Removed by moving Task's Canvas columns into a table
  // Courses owns and giving ranking a module-agnostic impact (plan step 8).
  "src/lib/erwin/rank-stage1.ts -> courses",
  "src/lib/erwin/open-work.ts -> courses",
  "src/lib/erwin/enrich-focus-task.ts -> courses",
  "src/app/api/erwin/focus/briefing/route.ts -> courses",
  "src/app/api/erwin/focus/queue/route.ts -> courses",
  // Focus's desk and the task sheet's pane draw the Canvas packet. Removed
  // by task slots in the client registry (TaskBody, TaskContext, TaskAside).
  "src/components/focus/FocusDesk.tsx -> courses",
  "src/components/tasks/datasheet/TaskSheet.tsx -> courses",
  // The Tasks page's materials column. Removed by sheet columns as a
  // module contribution.
  "src/app/(common)/tasks/page.tsx -> courses",
  "src/components/tasks/TaskList.tsx -> courses",
  "src/components/tasks/datasheet/columns.tsx -> courses",
  // Ladder settles bosses from Canvas's gradebook and names courses in the
  // XP log. Removed by proofs as a Courses contribution to Ladder.
  "src/lib/erwin/boss-proof.ts -> courses",
  "src/components/ladder/XpLog.tsx -> courses",
  // Goals ("Lords") on the Tasks page: the tab strip, the row picker, the
  // board, the sheet's column and boss rows. Removed by task-list slots
  // Ladder fills.
  "src/app/(common)/tasks/page.tsx -> ladder",
  "src/components/tasks/BoardView/BoardTask.tsx -> ladder",
  "src/components/tasks/BoardView/BoardView.tsx -> ladder",
  "src/components/tasks/LordSidebar.tsx -> ladder",
  "src/components/tasks/TaskList.tsx -> ladder",
  "src/components/tasks/TaskRow/TaskRowToolbar.tsx -> ladder",
  "src/components/tasks/TaskRow/index.tsx -> ladder",
  "src/components/tasks/TasksTopBar.tsx -> ladder",
  "src/components/tasks/datasheet/BossPane.tsx -> ladder",
  "src/components/tasks/datasheet/TaskSheet.tsx -> ladder",
  "src/components/tasks/datasheet/boss-cells.tsx -> ladder",
  "src/components/tasks/datasheet/columns.tsx -> ladder",
  "src/components/tasks/datasheet/sheet-rows.ts -> ladder",
  // Today's "Ladders to" panel. Removed by a Today task-panel slot.
  "src/components/today/CommandDashboard.tsx -> ladder",
]);

const ROOT = path.resolve(__dirname, "../../..");
const IMPORT =
  /(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function ownerOf(file: string): string | null {
  for (const [id, prefixes] of Object.entries(OWNED)) {
    if (prefixes.some((p) => file === p || file.startsWith(p))) return id;
  }
  return null;
}

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith("."))
    base = path.posix.join(path.posix.dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    const full = path.join(ROOT, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return candidate;
  }
  return base;
}

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) => {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory())
        return e.name === "__tests__" ? [] : sourceFiles(rel);
      return /\.tsx?$/.test(e.name) ? [rel] : [];
    });
}

function couplings(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles("src")) {
    if (REGISTRIES.has(file)) continue;
    const mine = ownerOf(file);
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const target = resolve(m[1] ?? m[2], file);
      const theirs = target ? ownerOf(target) : null;
      if (theirs && theirs !== mine) found.add(`${file} -> ${theirs}`);
    }
  }
  return found;
}

describe("module boundary", () => {
  const found = couplings();

  it("has no new way into a module except the registries", () => {
    expect([...found].filter((c) => !KNOWN.has(c)).sort()).toEqual([]);
  });

  it("lists no coupling that's already gone (delete its line in KNOWN)", () => {
    expect([...KNOWN].filter((c) => !found.has(c)).sort()).toEqual([]);
  });
});
