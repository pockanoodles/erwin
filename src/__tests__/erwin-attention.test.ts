import { type AttentionGoal, computeAttention } from "@/lib/erwin/attention";

const NOW = new Date("2026-09-28T12:00:00Z");

function goal(partial: Partial<AttentionGoal> & { title: string }): AttentionGoal {
  return {
    externalId: null,
    isBoss: false,
    targetDate: null,
    children: [],
    ...partial,
  };
}

const coopBoss = goal({
  title: "Spring 2027 co-op signed",
  externalId: "venture:coop-2027#boss:spring-2027-co-op-signed",
  isBoss: true,
  targetDate: new Date("2026-12-18T00:00:00Z"),
});
const bcf = goal({
  title: "BCF 2026",
  externalId: "venture:bcf-2026",
  children: [
    goal({
      title: "BCF 2026 executed",
      isBoss: true,
      targetDate: new Date("2026-11-22T00:00:00Z"),
    }),
  ],
});
const coop = goal({
  title: "Co-op 2027",
  externalId: "venture:coop-2027",
  children: [coopBoss, bcf],
});

describe("computeAttention", () => {
  it("lists overdue tasks most-late first with whole days late", () => {
    const { overdue } = computeAttention(
      [
        { id: "a", title: "Recent", dueDate: new Date("2026-09-27T00:00:00Z"), goals: [] },
        { id: "b", title: "Old", dueDate: new Date("2026-09-15T00:00:00Z"), goals: [coop] },
        { id: "c", title: "Future", dueDate: new Date("2026-10-01T00:00:00Z"), goals: [] },
      ],
      NOW
    );
    expect(overdue.map((o) => [o.id, o.daysLate])).toEqual([
      ["b", 13],
      ["a", 1],
    ]);
    expect(overdue[0].goals).toEqual([{ title: "Co-op 2027", slug: "coop-2027" }]);
  });

  it("flags undated goal-linked tasks but ignores undated loose tasks", () => {
    const { undatedGoalTasks } = computeAttention(
      [
        { id: "a", title: "Build the tracker", dueDate: null, goals: [coop] },
        { id: "b", title: "Buy socks", dueDate: null, goals: [] },
      ],
      NOW
    );
    expect(undatedGoalTasks.map((u) => u.id)).toEqual(["a"]);
  });

  it("takes the horizon from a direct boss, not a child Lord's boss", () => {
    const { undatedGoalTasks } = computeAttention(
      [{ id: "a", title: "Tracker", dueDate: null, goals: [coop] }],
      NOW
    );
    // bcf-2026's 11-22 boss is nearer, but it's bcf's deadline, not coop's.
    expect(undatedGoalTasks[0].horizon).toEqual({
      title: "Spring 2027 co-op signed",
      date: "2026-12-18T00:00:00.000Z",
    });
  });

  it("orders undated tasks by nearest horizon, horizonless last", () => {
    const { undatedGoalTasks } = computeAttention(
      [
        { id: "none", title: "A", dueDate: null, goals: [goal({ title: "Loose goal" })] },
        { id: "coop", title: "B", dueDate: null, goals: [coop] },
        { id: "bcf", title: "C", dueDate: null, goals: [bcf] },
      ],
      NOW
    );
    expect(undatedGoalTasks.map((u) => u.id)).toEqual(["bcf", "coop", "none"]);
  });

  it("ignores a horizon that has already passed", () => {
    const past = goal({ title: "Old", targetDate: new Date("2026-09-01T00:00:00Z") });
    const { undatedGoalTasks } = computeAttention(
      [{ id: "a", title: "T", dueDate: null, goals: [past] }],
      NOW
    );
    expect(undatedGoalTasks[0].horizon).toBeNull();
  });
});
