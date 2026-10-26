import {
  NO_GOAL_TAB,
  filterTasksByGoal,
  topGoalOf,
  topGoalsFrom,
} from "@/modules/ladder/goal-tabs";

// Co-op is a top goal with a milestone under it, and a milestone under that.
const goals = [
  { id: "coop", title: "Land a co-op", parentGoalIds: [] },
  { id: "apps", title: "Send 15 applications", parentGoalIds: ["coop"] },
  { id: "first5", title: "First five", parentGoalIds: ["apps"] },
  { id: "run", title: "Run three times a week", parentGoalIds: [] },
];
const task = (id: string, ...goalIds: string[]) => ({
  id,
  goalLinks: goalIds.map((goalId) => ({ goalId })),
});

describe("goal tabs", () => {
  const tops = topGoalsFrom(goals);

  it("makes a tab of each top goal, covering every goal beneath it", () => {
    expect(tops.map((g) => g.id)).toEqual(["coop", "run"]);
    expect([...tops[0].goalIds].sort()).toEqual(["apps", "coop", "first5"]);
  });

  it("finds the top goal a task works toward through any goal on its path", () => {
    expect(topGoalOf(task("t", "first5"), tops)?.id).toBe("coop");
    expect(topGoalOf(task("t", "elsewhere"), tops)).toBeUndefined();
  });

  it("narrows to a goal's path, to tasks with no goal, or not at all", () => {
    const tasks = [task("a", "first5"), task("b", "run"), task("c")];
    const ids = (active: string | null) =>
      filterTasksByGoal(tasks, tops, active).map((t) => t.id);
    expect(ids("coop")).toEqual(["a"]);
    expect(ids(NO_GOAL_TAB)).toEqual(["c"]);
    expect(ids(null)).toEqual(["a", "b", "c"]);
    // A tab whose goal is gone hides nothing.
    expect(ids("gone")).toEqual(["a", "b", "c"]);
  });
});
