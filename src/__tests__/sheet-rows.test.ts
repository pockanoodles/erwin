import { bandSize, buildSheetRows, rowKey } from "@/components/tasks/datasheet/sheet-rows";

import { UNASSIGNED_LORD_ID, type Boss } from "@/store/lord";

import type { Task } from "@/types/task";

const task = (id: string, title = id) => ({ id, title }) as Task;
const boss = (id: string, over: Partial<Boss> = {}): Boss => ({
  id,
  title: id,
  targetDate: null,
  felled: false,
  lordId: "school",
  boundTaskId: null,
  ...over,
});

const bosses = [
  boss("test-1"),
  boss("pitch", { boundTaskId: "final-pitch" }),
  boss("co-op signed", { lordId: "coop" }),
  boss("old exam", { felled: true }),
];
const tasks = [task("hw"), task("final-pitch", "Final Creative Pitch")];
const all = { activeLordId: null, search: undefined, showFelled: false };

describe("buildSheetRows", () => {
  it("puts open bosses first and a bound boss's task in the band as the boss", () => {
    const rows = buildSheetRows(tasks, bosses, all);
    expect(rows.map((r) => `${r.kind}:${rowKey(r)}`)).toEqual([
      "boss:test-1",
      "task:final-pitch",
      "boss:co-op signed",
      "task:hw",
    ]);
    expect(rows[1]).toMatchObject({ kind: "task", boss: { id: "pitch" } });
    expect(bandSize(rows)).toBe(3);
  });

  it("follows the Lord tab, and Unassigned has no bosses", () => {
    expect(buildSheetRows(tasks, bosses, { ...all, activeLordId: "coop" }).map(rowKey)).toEqual([
      "co-op signed",
      "hw",
      "final-pitch",
    ]);
    expect(bandSize(buildSheetRows(tasks, bosses, { ...all, activeLordId: UNASSIGNED_LORD_ID }))).toBe(0);
  });

  it("drops a bound boss when its task is filtered out, and felled ones unless completed work shows", () => {
    const keys = buildSheetRows([task("hw")], bosses, { ...all, showFelled: true }).map(rowKey);
    expect(keys).toEqual(["test-1", "co-op signed", "old exam", "hw"]);
  });

  it("searches unbound bosses by title", () => {
    const keys = buildSheetRows([], bosses, { ...all, search: "TEST" }).map(rowKey);
    expect(keys).toEqual(["test-1"]);
  });
});
