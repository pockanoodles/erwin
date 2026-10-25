import type { TaskColumn } from "@/components/tasks/datasheet/columns";
import {
  type TasksLens,
  applyLensFilters,
  lensBand,
  withLensColumns,
} from "@/components/tasks/lens";

import type { Task } from "@/types/task";

const column = (id: string, after?: string): TaskColumn => ({
  id,
  after,
  label: id,
  sortKey: id,
  width: 50,
  render: () => null,
  text: () => "",
  editor: { kind: "readonly" },
  formValue: () => "",
});
const task = (id: string) => ({ id, title: id }) as Task;
// Stand-ins for the core's columns: columns.tsx is JSX, which these tests don't load.
const CORE = ["status", "title", "dueDate", "duration", "schedule"].map((id) =>
  column(id)
);

describe("withLensColumns", () => {
  it("places each module column after its core column, unknown anchors last", () => {
    const lenses: TasksLens[] = [
      { columns: [column("materials", "dueDate")] },
      { columns: [column("lord", "duration"), column("stray", "nope")] },
    ];
    expect(withLensColumns(CORE, lenses).map((c) => c.id)).toEqual([
      "status",
      "title",
      "dueDate",
      "materials",
      "duration",
      "lord",
      "schedule",
      "stray",
    ]);
  });

  it("is the core's columns alone with no lenses", () => {
    expect(withLensColumns(CORE, [])).toEqual(CORE);
  });
});

describe("applyLensFilters and lensBand", () => {
  it("narrows by every lens in turn, and gathers every lens's band", () => {
    const tasks = [task("a"), task("b"), task("c")];
    const lenses: TasksLens[] = [
      { filter: (ts) => ts.filter((t) => t.id !== "a") },
      {
        filter: (ts) => ts.filter((t) => t.id !== "c"),
        band: (ts) =>
          ts.map((t) => ({
            kind: "task",
            task: t,
            mark: { glyph: "*", title: t.id },
          })),
      },
      {},
    ];
    const shown = applyLensFilters(lenses, tasks);
    expect(shown.map((t) => t.id)).toEqual(["b"]);
    expect(lensBand(lenses, shown, { showDone: false })).toHaveLength(1);
  });
});
