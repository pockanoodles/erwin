import {
  BOSS_XP,
  creditedGoals,
  levelFor,
  levelProgress,
  scoreEvent,
  statsOf,
  sumStats,
  type XpGoal,
} from "../sigwald/xp";

const goal = (id: string, develops: string[], parentIds: string[] = [], isBoss = false): XpGoal => ({
  id,
  develops,
  parentIds,
  isBoss,
});

const goalMap = (...goals: XpGoal[]) => new Map(goals.map((g) => [g.id, g]));

describe("levelFor", () => {
  it("rides the triangular curve ops uses", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(2.9)).toBe(1);
    expect(levelFor(3)).toBe(2);
    expect(levelFor(14.99)).toBe(4);
    expect(levelFor(15)).toBe(5);
    expect(levelFor(55)).toBe(10);
    expect(levelFor(210)).toBe(20);
  });
});

describe("levelProgress", () => {
  it("measures level 1 from zero, since 0 to 2 XP is all level 1", () => {
    expect(levelProgress(0)).toEqual({ level: 1, into: 0, span: 3, toNext: 3 });
  });

  it("puts 23 XP two into level 6, which takes 7", () => {
    expect(levelProgress(23)).toEqual({ level: 6, into: 2, span: 7, toNext: 5 });
  });
});

describe("creditedGoals", () => {
  const goals = goalMap(
    goal("school", ["intelligence", "mind"]),
    goal("exam", [], ["school"], true),
    goal("solo-boss", [], [], true)
  );

  it("passes a boss's credit up to its goal, once", () => {
    expect(creditedGoals(["school", "exam"], goals)).toEqual(["school"]);
  });

  it("lets a boss with nothing above it stand for itself", () => {
    expect(creditedGoals(["solo-boss"], goals)).toEqual(["solo-boss"]);
  });

  it("ignores links to goals that no longer exist", () => {
    expect(creditedGoals(["gone"], goals)).toEqual([]);
  });
});

describe("statsOf", () => {
  it("inherits from the goals above when a goal develops nothing itself", () => {
    const goals = goalMap(goal("parent", ["vigor", "strength"]), goal("child", [], ["parent"]));
    expect(statsOf("child", goals)).toEqual(["vigor", "strength"]);
  });

  it("survives a loop in the graph", () => {
    const goals = goalMap(goal("a", [], ["b"]), goal("b", [], ["a"]));
    expect(statsOf("a", goals)).toEqual([]);
  });
});

describe("scoreEvent", () => {
  const goals = goalMap(
    goal("school", ["intelligence", "mind"]),
    goal("gym", ["vigor", "strength", "endurance"]),
    goal("bare", []),
    goal("exam", [], ["school"], true)
  );

  it("splits one XP evenly across a goal's stats", () => {
    const event = scoreEvent({ kind: "task", id: "t", day: "2026-10-01", goalIds: ["school"] }, goals);
    expect(event.stats).toEqual({ intelligence: 0.5, mind: 0.5 });
    expect(event.lost).toBe(0);
  });

  it("splits across goals first, so serving two goals mints no extra XP", () => {
    const event = scoreEvent({ kind: "task", id: "t", day: "2026-10-01", goalIds: ["school", "gym"] }, goals);
    const sum = Object.values(event.stats).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBeCloseTo(1);
    expect(event.stats.intelligence).toBeCloseTo(0.25);
    expect(event.stats.vigor).toBeCloseTo(1 / 6);
  });

  it("counts XP that reaches no stat as lost, never as invented", () => {
    expect(scoreEvent({ kind: "task", id: "t", day: "2026-10-01", goalIds: [] }, goals).lost).toBe(1);
    expect(scoreEvent({ kind: "task", id: "t", day: "2026-10-01", goalIds: ["bare"] }, goals).lost).toBe(1);
  });

  it("pays a felled boss five XP across its goal's stats", () => {
    const event = scoreEvent({ kind: "boss", id: "exam", day: "2026-10-09", goalIds: ["exam"] }, goals);
    expect(event.credit).toEqual([{ goalId: "school", xp: BOSS_XP }]);
    expect(event.stats).toEqual({ intelligence: 2.5, mind: 2.5 });
  });
});

describe("sumStats", () => {
  it("lands nine thirds on exactly three, so the level arrives", () => {
    const goals = goalMap(goal("three", ["vigor", "mind", "faith"]));
    const events = Array.from({ length: 9 }, (_, i) =>
      scoreEvent({ kind: "task", id: `t${i}`, day: "2026-10-01", goalIds: ["three"] }, goals)
    );
    const sum = sumStats(events);
    expect(sum.vigor).toBe(3);
    expect(levelFor(sum.vigor)).toBe(2);
    expect(sum.arcane).toBe(0);
  });
});
