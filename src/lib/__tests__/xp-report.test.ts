import { buildXpReport, type XpReportGoalRow, type XpReportInput } from "../erwin/xp-report";

const goal = (row: Partial<XpReportGoalRow> & Pick<XpReportGoalRow, "id" | "title">): XpReportGoalRow => ({
  isBoss: false,
  status: "active",
  develops: [],
  parentIds: [],
  day: null,
  updatedDay: "2026-09-01",
  externalId: null,
  cycleId: "hex5",
  ...row,
});

const input: XpReportInput = {
  from: "2026-10-18",
  to: "2026-10-24",
  currentCycleId: "hex5",
  goals: [
    goal({ id: "school", title: "School", develops: ["intelligence", "mind"], externalId: "venture:school-f25" }),
    goal({ id: "gym", title: "Gym", develops: ["vigor", "strength"] }),
    goal({ id: "side", title: "Side quest" }),
    goal({ id: "old", title: "Last hex's goal", develops: ["faith"], cycleId: "hex4" }),
    goal({
      id: "midterm",
      title: "Midterm",
      isBoss: true,
      status: "done",
      parentIds: ["school"],
      day: "2026-10-22",
      externalId: "venture:school-f25#boss:midterm",
    }),
  ],
  done: [
    { id: "t1", day: "2026-10-20", source: "CANVAS", goalIds: ["school"] },
    { id: "t2", day: "2026-10-10", source: "CANVAS", goalIds: ["school"] },
    { id: "t3", day: "2026-10-21", source: "venture:unknown", goalIds: [] },
    { id: "t4", day: "2026-10-23", source: null, goalIds: [] },
    { id: "t5", day: "2026-10-24", source: null, goalIds: ["side"] },
    { id: "t6", day: "2026-10-25", source: "CANVAS", goalIds: ["school"] },
  ],
};

describe("buildXpReport", () => {
  const report = buildXpReport(input);

  it("adds the span's tasks and felled bosses, and lifetime through its last day", () => {
    expect(report.stats.intelligence).toEqual({
      xp: 3.5,
      level: 2,
      into: 0.5,
      span: 3,
      toNext: 2.5,
      gained: 3,
      levelBefore: 1,
    });
    expect(report.stats.vigor).toMatchObject({ xp: 0, level: 1, gained: 0, levelBefore: 1 });
    expect(report.tasks).toBe(4);
  });

  it("credits goals, and a goal with no stats passes no XP", () => {
    expect(report.goals).toEqual([
      { externalId: "venture:school-f25", title: "School", tasks: 1, xp: 6 },
      { externalId: null, title: "Side quest", tasks: 1, xp: 0 },
    ]);
  });

  it("names where unlinked work came from", () => {
    expect(report.unlinked).toEqual([
      { source: null, count: 1 },
      { source: "venture:unknown", count: 1 },
    ]);
  });

  it("dates a felled boss on its day, under its goal", () => {
    expect(report.bosses).toEqual([
      {
        externalId: "venture:school-f25#boss:midterm",
        title: "Midterm",
        day: "2026-10-22",
        goal: { externalId: "venture:school-f25", title: "School" },
      },
    ]);
  });

  it("counts only the running hex's goals as feeders, and no boss under a goal", () => {
    expect(report.feeders.intelligence).toEqual([{ externalId: "venture:school-f25", title: "School" }]);
    expect(report.feeders.vigor.map((g) => g.title)).toEqual(["Gym"]);
    expect(report.feeders.faith).toEqual([]);
  });
});
