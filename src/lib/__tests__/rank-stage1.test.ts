import {
  computeStage1Scores,
  computeUrgencyTier,
  deadlinePressure,
  effectiveGoalImpact,
  effectiveGradeImpact,
  effortFit,
  filterTasksForRanking,
  isPersonalFillerCandidate,
  orderTasksStage1,
  pickTopTaskStage1,
  type TaskForRanking,
} from "../erwin/rank-stage1";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const HOUR = 3_600_000;

function at(offsetHours: number): Date {
  return new Date(NOW.getTime() + offsetHours * HOUR);
}

let idCounter = 0;
function makeTask(overrides: Partial<TaskForRanking> = {}): TaskForRanking {
  idCounter += 1;
  return {
    id: `task-${idCounter}`,
    title: `Task ${idCounter}`,
    status: "todo",
    dueDate: null,
    unlockAt: null,
    lockAt: null,
    duration: 30,
    gradeImpactScore: null,
    submissionStatus: null,
    source: "MANUAL",
    category: null,
    priority: null,
    pointsPossible: null,
    courseId: null,
    skipCount: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    goalImportanceScore: null,
    ...overrides,
  };
}

describe("deadlinePressure", () => {
  test("no due date returns 0", () => {
    expect(deadlinePressure(makeTask({ dueDate: null }), NOW)).toBe(0);
  });

  test("overdue returns 1", () => {
    expect(deadlinePressure(makeTask({ dueDate: at(-5) }), NOW)).toBe(1);
  });

  test("late-but-before-lock stays at max", () => {
    const task = makeTask({ dueDate: at(-5), lockAt: at(10) });
    expect(deadlinePressure(task, NOW)).toBe(1);
  });

  test("midpoint (48h out) is 0.5", () => {
    expect(deadlinePressure(makeTask({ dueDate: at(48) }), NOW)).toBeCloseTo(
      0.5,
      5
    );
  });

  test("far future approaches 0", () => {
    expect(deadlinePressure(makeTask({ dueDate: at(300) }), NOW)).toBeLessThan(
      0.001
    );
  });

  test("monotonic: sooner deadline is more pressing", () => {
    const soon = deadlinePressure(makeTask({ dueDate: at(12) }), NOW);
    const later = deadlinePressure(makeTask({ dueDate: at(96) }), NOW);
    expect(soon).toBeGreaterThan(later);
  });
});

describe("effectiveGradeImpact", () => {
  test("null grade impact is 0", () => {
    expect(
      effectiveGradeImpact(makeTask({ gradeImpactScore: null }), NOW)
    ).toBe(0);
  });

  test("no due date returns raw grade impact", () => {
    expect(
      effectiveGradeImpact(
        makeTask({ gradeImpactScore: 0.8, dueDate: null }),
        NOW
      )
    ).toBe(0.8);
  });

  test("before due date returns raw grade impact", () => {
    expect(
      effectiveGradeImpact(
        makeTask({ gradeImpactScore: 0.8, dueDate: at(10) }),
        NOW
      )
    ).toBe(0.8);
  });

  test("past lock halves impact (floored at 0.05)", () => {
    const task = makeTask({
      gradeImpactScore: 0.8,
      dueDate: at(-120),
      lockAt: at(-24),
    });
    expect(effectiveGradeImpact(task, NOW)).toBeCloseTo(0.4, 5);
  });

  test("late without lock applies per-day penalty", () => {
    // 2 days late → penalty 0.2 → 0.8 * 0.8 = 0.64
    const task = makeTask({ gradeImpactScore: 0.8, dueDate: at(-48) });
    expect(effectiveGradeImpact(task, NOW)).toBeCloseTo(0.64, 5);
  });

  test("penalty is floored at 0.05", () => {
    const task = makeTask({ gradeImpactScore: 0.1, dueDate: at(-1000) });
    expect(effectiveGradeImpact(task, NOW)).toBe(0.05);
  });
});

describe("effortFit", () => {
  test("perfect fit is 1", () => {
    expect(effortFit(60, 60)).toBe(1);
  });

  test("task half the slot", () => {
    expect(effortFit(30, 60)).toBeCloseTo(0.5, 5);
  });

  test("task twice the slot", () => {
    expect(effortFit(60, 30)).toBeCloseTo(0.5, 5);
  });

  test("clamps non-positive inputs to at least 1 minute", () => {
    expect(effortFit(0, 0)).toBe(1);
  });
});

describe("computeUrgencyTier", () => {
  test("danger flag forces DANGER", () => {
    expect(computeUrgencyTier(makeTask({ dueDate: at(200) }), NOW, true)).toBe(
      "DANGER"
    );
  });

  test("no due date is NONE", () => {
    expect(computeUrgencyTier(makeTask({ dueDate: null }), NOW, false)).toBe(
      "NONE"
    );
  });

  test("overdue is DANGER even without the flag", () => {
    expect(computeUrgencyTier(makeTask({ dueDate: at(-1) }), NOW, false)).toBe(
      "DANGER"
    );
  });

  test("within 24h is HIGH", () => {
    expect(computeUrgencyTier(makeTask({ dueDate: at(10) }), NOW, false)).toBe(
      "HIGH"
    );
  });

  test("within a week is NORMAL", () => {
    expect(computeUrgencyTier(makeTask({ dueDate: at(100) }), NOW, false)).toBe(
      "NORMAL"
    );
  });

  test("beyond a week is LOW", () => {
    expect(computeUrgencyTier(makeTask({ dueDate: at(300) }), NOW, false)).toBe(
      "LOW"
    );
  });
});

describe("effectiveGoalImpact", () => {
  test("unlinked task contributes 0", () => {
    expect(effectiveGoalImpact(makeTask({ goalImportanceScore: null }))).toBe(
      0
    );
  });

  test("importance 90 normalizes to 0.9", () => {
    expect(
      effectiveGoalImpact(makeTask({ goalImportanceScore: 90 }))
    ).toBeCloseTo(0.9, 5);
  });

  test("clamps above 100 to 1", () => {
    expect(effectiveGoalImpact(makeTask({ goalImportanceScore: 150 }))).toBe(1);
  });

  test("clamps below 0 to 0", () => {
    expect(effectiveGoalImpact(makeTask({ goalImportanceScore: -10 }))).toBe(0);
  });
});

describe("filterTasksForRanking", () => {
  test("removes completed, submitted/graded, and still-locked tasks", () => {
    const completed = makeTask({ status: "completed" });
    const submitted = makeTask({ submissionStatus: "submitted" });
    const graded = makeTask({ submissionStatus: "graded" });
    const locked = makeTask({ unlockAt: at(24) });
    const open = makeTask({ status: "todo" });

    const kept = filterTasksForRanking(
      [completed, submitted, graded, locked, open],
      NOW
    );

    expect(kept.map((t) => t.id)).toEqual([open.id]);
  });

  test("keeps a task whose unlock time has passed", () => {
    const unlocked = makeTask({ unlockAt: at(-1) });
    expect(filterTasksForRanking([unlocked], NOW)).toHaveLength(1);
  });
});

describe("isPersonalFillerCandidate", () => {
  test("personal manual task is a filler candidate", () => {
    expect(isPersonalFillerCandidate(makeTask({ source: "MANUAL" }))).toBe(
      true
    );
  });

  test("canvas task is not a filler candidate", () => {
    expect(isPersonalFillerCandidate(makeTask({ source: "CANVAS" }))).toBe(
      false
    );
  });

  test("high-priority task is not a filler candidate", () => {
    expect(
      isPersonalFillerCandidate(
        makeTask({ source: "MANUAL", priority: "high" })
      )
    ).toBe(false);
  });

  test("goal-linked task is never a filler candidate", () => {
    expect(
      isPersonalFillerCandidate(
        makeTask({ source: "MANUAL", goalImportanceScore: 80 })
      )
    ).toBe(false);
  });
});

describe("computeStage1Scores", () => {
  test("base score blends impact, deadline pressure, and effort fit", () => {
    const task = makeTask({ dueDate: null, duration: 240 });
    const norm = new Map([[task.id, 1]]);
    // dp = 0 (no due date), ef = effortFit(240, 240) = 1, impact = 1
    // base = 0.35*1 + 0.45*0 + 0.2*1 = 0.55
    const scores = computeStage1Scores(task, [task], NOW, 240, norm);
    expect(scores.baseScore).toBeCloseTo(0.55, 5);
    expect(scores.urgencyTier).toBe("NONE");
    expect(scores.danger).toBe(false);
    expect(scores.fillerDemoted).toBe(false);
  });

  test("personal task is demoted when a Canvas task is urgent", () => {
    const canvasUrgent = makeTask({ source: "CANVAS", dueDate: at(10) });
    const personal = makeTask({ source: "MANUAL", dueDate: at(100) });
    const pool = [canvasUrgent, personal];
    const norm = new Map(pool.map((t) => [t.id, 0.5]));

    const personalScores = computeStage1Scores(personal, pool, NOW, null, norm);
    expect(personalScores.fillerDemoted).toBe(true);
  });

  test("goal-linked personal task is not demoted alongside urgent Canvas work", () => {
    const canvasUrgent = makeTask({ source: "CANVAS", dueDate: at(10) });
    const goalPersonal = makeTask({
      source: "MANUAL",
      dueDate: at(100),
      goalImportanceScore: 80,
    });
    const pool = [canvasUrgent, goalPersonal];
    const norm = new Map(pool.map((t) => [t.id, 0.5]));

    const goalScores = computeStage1Scores(goalPersonal, pool, NOW, null, norm);
    expect(goalScores.fillerDemoted).toBe(false);
  });
});

describe("orderTasksStage1 — goal impact path", () => {
  test("a high-importance goal task outranks a low-impact Canvas task", () => {
    const canvasLow = makeTask({
      source: "CANVAS",
      gradeImpactScore: 0.1,
      dueDate: at(100),
      pointsPossible: 10,
      courseId: "c1",
    });
    const goalTask = makeTask({
      source: "MANUAL",
      goalImportanceScore: 90,
      dueDate: at(100),
    });

    const ordered = orderTasksStage1([canvasLow, goalTask], NOW, {
      slotMinutes: null,
    });

    expect(ordered[0].id).toBe(goalTask.id);
    expect(ordered[1].id).toBe(canvasLow.id);
  });

  test("goal-linked personal task ranks ahead of a demoted plain personal task", () => {
    const canvasUrgent = makeTask({
      source: "CANVAS",
      gradeImpactScore: 0.5,
      dueDate: at(10),
    });
    const goalPersonal = makeTask({
      source: "MANUAL",
      goalImportanceScore: 80,
      dueDate: at(100),
    });
    const plainPersonal = makeTask({
      source: "MANUAL",
      dueDate: at(100),
    });

    const ordered = orderTasksStage1(
      [canvasUrgent, goalPersonal, plainPersonal],
      NOW,
      { slotMinutes: null }
    );

    const goalIdx = ordered.findIndex((t) => t.id === goalPersonal.id);
    const plainIdx = ordered.findIndex((t) => t.id === plainPersonal.id);
    // Plain personal is demoted to the filler lane (last); the goal-linked one is not.
    expect(plainIdx).toBe(ordered.length - 1);
    expect(goalIdx).toBeLessThan(plainIdx);
  });

  test("empty input yields empty output", () => {
    expect(orderTasksStage1([], NOW, { slotMinutes: null })).toEqual([]);
  });
});

describe("pickTopTaskStage1", () => {
  test("filters out completed tasks before picking the top", () => {
    const completed = makeTask({ status: "completed", dueDate: at(1) });
    const goalTask = makeTask({ goalImportanceScore: 95, dueDate: at(100) });

    const top = pickTopTaskStage1([completed, goalTask], NOW, {
      slotMinutes: null,
    });

    expect(top?.id).toBe(goalTask.id);
  });

  test("returns null when nothing is eligible", () => {
    const completed = makeTask({ status: "completed" });
    expect(
      pickTopTaskStage1([completed], NOW, { slotMinutes: null })
    ).toBeNull();
  });
});
