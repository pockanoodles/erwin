import {
  bandSize,
  buildSheetRows,
  markOf,
  rowKey,
} from "@/components/tasks/datasheet/sheet-rows";
import type { BandRow, RowMark } from "@/components/tasks/lens";

import type { Task } from "@/types/task";

const task = (id: string) => ({ id, title: id }) as Task;
const mark: RowMark = { glyph: "⚔", title: "Boss: pitch" };
const item = (key: string): BandRow => ({
  kind: "item",
  item: {
    key,
    mark,
    done: false,
    cell: () => null,
    text: () => "",
    pane: () => null,
  },
});

describe("buildSheetRows", () => {
  it("puts the band first, and a task pulled into it appears there once", () => {
    const rows = buildSheetRows(
      [task("hw"), task("pitch")],
      [item("test-1"), { kind: "task", task: task("pitch"), mark }]
    );
    expect(rows.map((r) => `${r.kind}:${rowKey(r)}`)).toEqual([
      "item:test-1",
      "task:pitch",
      "task:hw",
    ]);
    expect(bandSize(rows)).toBe(2);
    expect(markOf(rows[1])).toBe(mark);
    expect(markOf(rows[2])).toBeNull();
  });

  it("is just the tasks when no module pins anything", () => {
    const rows = buildSheetRows([task("hw")], []);
    expect(rows.map(rowKey)).toEqual(["hw"]);
    expect(bandSize(rows)).toBe(0);
  });
});
