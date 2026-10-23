import {
  type GradebookEntry,
  type GradebookGroup,
  coursePercent,
  letterOutlook,
  letterFor,
  projectMissedAssignment,
} from "../erwin/grade-projection";

const group = (id: string, weight: number | null, drops: Partial<GradebookGroup> = {}): GradebookGroup => ({
  id,
  weight,
  dropLowest: 0,
  dropHighest: 0,
  neverDrop: [],
  ...drops,
});

const entry = (canvasId: string, groupId: string, score: number | null, points = 100, state = score == null ? "unsubmitted" : "graded"): GradebookEntry => ({
  canvasId,
  groupId,
  pointsPossible: points,
  omitFromFinalGrade: false,
  state,
  score,
});

describe("coursePercent", () => {
  it("rescales weights over the groups that have graded work, like Canvas's current score", () => {
    // Exams are 60% but none is graded yet: homework alone is the current grade.
    const groups = [group("hw", 40), group("exams", 60)];
    const entries = [entry("h1", "hw", 9, 10), entry("h2", "hw", 8, 10), entry("e1", "exams", null)];
    expect(coursePercent(entries, groups, { weighted: true })).toBeCloseTo(85);
  });

  it("totals points when the course doesn't weight its groups", () => {
    const groups = [group("hw", null), group("tests", null)];
    const entries = [entry("h1", "hw", 5, 5), entry("t1", "tests", 98, 100)];
    expect(coursePercent(entries, groups, { weighted: false })).toBeCloseTo((103 / 105) * 100);
  });

  it("drops the lowest score in a group but never a protected one", () => {
    const groups = [group("q", 100, { dropLowest: 1, neverDrop: ["q1"] })];
    const entries = [entry("q1", "q", 2, 10), entry("q2", "q", 5, 10), entry("q3", "q", 9, 10)];
    // q1 is protected, so q2 (the lowest droppable) goes.
    expect(coursePercent(entries, groups, { weighted: true })).toBeCloseTo((11 / 20) * 100);
  });

  it("leaves out excused, omitted and pointless work", () => {
    const groups = [group("hw", 100)];
    const entries: GradebookEntry[] = [
      entry("h1", "hw", 10, 10),
      { ...entry("h2", "hw", 0, 10), state: "excused" },
      { ...entry("h3", "hw", 0, 10), omitFromFinalGrade: true },
      entry("h4", "hw", 0, 0),
    ];
    expect(coursePercent(entries, groups, { weighted: true })).toBe(100);
    expect(coursePercent([], groups, { weighted: true })).toBeNull();
  });
});

describe("projectMissedAssignment", () => {
  it("anchors on Canvas's current score and applies Erwin's drop", () => {
    const groups = [group("hw", 50), group("exams", 50)];
    const entries = [entry("h1", "hw", 10, 10), entry("e1", "exams", 90), entry("e2", "exams", null)];
    const projection = projectMissedAssignment(
      { weighted: true, canvasCurrentScore: 94.5, scheme: null, entries, groups },
      "e2"
    );
    // Erwin: current 95, if e2 is a zero the exam group falls to 45% → 72.5. Δ −22.5 from Canvas's 94.5.
    expect(projection).toEqual({
      currentCourseGrade: 94.5,
      gradeIfMissed: 72,
      letterGradeCurrent: "A",
      letterGradeIfMissed: "C-",
    });
  });
});

describe("letterFor", () => {
  it("uses the course's own scheme when Canvas sends one", () => {
    const scheme: Array<[string, number]> = [
      ["A", 0.94],
      ["A-", 0.9],
      ["B+", 0.87],
      ["F", 0],
    ];
    expect(letterFor(93.5, scheme)).toBe("A-");
    expect(letterFor(93.5)).toBe("A");
    expect(letterFor(10, scheme)).toBe("F");
  });
});

describe("letterOutlook", () => {
  it("solves for the average needed on what's left, by letter", () => {
    // Homework done at 90% (40% weight); the exam (60%) is still ahead.
    const groups = [group("hw", 40), group("exams", 60)];
    const entries = [entry("h1", "hw", 9, 10), entry("e1", "exams", null)];
    const { remainingPoints, outlook } = letterOutlook(entries, groups, { weighted: true, letters: 3 });
    expect(remainingPoints).toBe(100);
    // A needs 93: 0.4·0.9 + 0.6·x = 0.93 → x = 0.95
    expect(outlook[0]).toEqual({ letter: "A", cutoff: 93, needed: 95, status: "reachable" });
    expect(outlook[1]).toMatchObject({ letter: "A-", needed: 90 });
  });

  it("counts missed work as a zero and calls letters secured or out of reach", () => {
    const groups = [group("all", null)];
    const entries = [entry("a", "all", 95, 100), { ...entry("b", "all", null, 10), state: "missed" }, entry("c", "all", null, 10)];
    const { outlook } = letterOutlook(entries, groups, { weighted: false });
    // 95 of 120 so far (the miss is a zero); a perfect c only reaches 105/120 = 87.5%.
    expect(outlook.find((o) => o.letter === "A")?.status).toBe("out_of_reach");
    expect(outlook.find((o) => o.letter === "B+")).toMatchObject({ status: "reachable", needed: 94 });
    expect(outlook.find((o) => o.letter === "C+")?.status).toBe("secured");
  });
});
