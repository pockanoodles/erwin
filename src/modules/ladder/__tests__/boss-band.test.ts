import { planBossBand } from "@/modules/ladder/boss-band";

import { type Boss, UNASSIGNED_LORD_ID } from "@/store/lord";

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
const all: { activeLordId: string | null; search?: string; showDone: boolean } =
  {
    activeLordId: null,
    showDone: false,
  };
const keys = (ts: Task[], view = all) =>
  planBossBand(ts, bosses, view).map((e) =>
    e.kind === "task" ? `task:${e.task.id}` : `boss:${e.boss.id}`
  );

describe("planBossBand", () => {
  it("pins open bosses, and a bound boss's own task as the boss", () => {
    expect(keys(tasks)).toEqual([
      "boss:test-1",
      "task:final-pitch",
      "boss:co-op signed",
    ]);
    expect(planBossBand(tasks, bosses, all)[1]).toMatchObject({
      kind: "task",
      boss: { id: "pitch" },
    });
  });

  it("follows the Lord tab, and Unassigned has no bosses", () => {
    expect(keys(tasks, { ...all, activeLordId: "coop" })).toEqual([
      "boss:co-op signed",
    ]);
    expect(keys(tasks, { ...all, activeLordId: UNASSIGNED_LORD_ID })).toEqual(
      []
    );
  });

  it("drops a bound boss when its task is filtered out, and felled ones unless completed work shows", () => {
    expect(keys([task("hw")], { ...all, showDone: true })).toEqual([
      "boss:test-1",
      "boss:co-op signed",
      "boss:old exam",
    ]);
  });

  it("searches unbound bosses by title", () => {
    expect(keys([], { ...all, search: "TEST" })).toEqual(["boss:test-1"]);
  });
});
