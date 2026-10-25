import {
  type TaskForRanking,
  computeStage1Scores,
  computeUrgencyTier,
  deadlinePressure,
  effectiveImpact,
  effectiveLift,
  effortFit,
  filterTasksForRanking,
  impactWorkIsUrgent,
  isFillerCandidate,
  isSkipCooling,
  orderTasksStage1,
  pickTopTaskStage1,
  skipPenalty,
  visibilityBoost,
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
    impact: null,
    closedAt: null,
    priority: null,
    skipCount: 0,
    lastSkippedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    postponedUntil: null,
    lift: null,
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

describe("effectiveImpact", () => {
  test("null impact is 0", () => {
    expect(effectiveImpact(makeTask({ impact: null }), NOW)).toBe(0);
  });

  test("no due date returns raw impact", () => {
    expect(effectiveImpact(makeTask({ impact: 0.8, dueDate: null }), NOW)).toBe(
      0.8
    );
  });

  test("before due date returns raw impact", () => {
    expect(
      effectiveImpact(makeTask({ impact: 0.8, dueDate: at(10) }), NOW)
    ).toBe(0.8);
  });

  test("past lock halves impact (floored at 0.05)", () => {
    const task = makeTask({
      impact: 0.8,
      dueDate: at(-120),
      lockAt: at(-24),
    });
    expect(effectiveImpact(task, NOW)).toBeCloseTo(0.4, 5);
  });

  test("late without lock applies per-day penalty", () => {
    // 2 days late → penalty 0.2 → 0.8 * 0.8 = 0.64
    const task = makeTask({ impact: 0.8, dueDate: at(-48) });
    expect(effectiveImpact(task, NOW)).toBeCloseTo(0.64, 5);
  });

  test("penalty is floored at 0.05", () => {
    const task = makeTask({ impact: 0.1, dueDate: at(-1000) });
    expect(effectiveImpact(task, NOW)).toBe(0.05);
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

describe("effectiveLift", () => {
  test("a task nothing lifts contributes 0", () => {
    expect(effectiveLift(makeTask({ lift: null }))).toBe(0);
  });

  test("passes a 0–1 lift through", () => {
    expect(effectiveLift(makeTask({ lift: 0.9 }))).toBeCloseTo(0.9, 5);
  });

  test("clamps above 1 to 1", () => {
    expect(effectiveLift(makeTask({ lift: 1.5 }))).toBe(1);
  });

  test("clamps below 0 to 0", () => {
    expect(effectiveLift(makeTask({ lift: -0.1 }))).toBe(0);
  });
});

describe("filterTasksForRanking", () => {
  test("removes completed, closed, and still-locked tasks", () => {
    const completed = makeTask({ status: "completed" });
    // Canvas closed it without a submission: it's not done, but it's gone.
    const missed = makeTask({ closedAt: at(-2) });
    const locked = makeTask({ unlockAt: at(24) });
    const open = makeTask({ status: "todo" });

    const kept = filterTasksForRanking([completed, missed, locked, open], NOW);

    expect(kept.map((t) => t.id)).toEqual([open.id]);
  });

  test("keeps a task whose unlock time has passed", () => {
    const unlocked = makeTask({ unlockAt: at(-1) });
    expect(filterTasksForRanking([unlocked], NOW)).toHaveLength(1);
  });

  test("removes a task still deferred past now", () => {
    const deferred = makeTask({ postponedUntil: at(2) });
    expect(filterTasksForRanking([deferred], NOW)).toHaveLength(0);
  });

  test("keeps a task whose defer time has passed", () => {
    const due = makeTask({ postponedUntil: at(-1) });
    expect(filterTasksForRanking([due], NOW)).toHaveLength(1);
  });

  test("removes subtasks so only the parent can surface", () => {
    const parent = makeTask({ id: "parent" });
    const child = makeTask({ id: "child", parentTaskId: "parent" });
    expect(
      filterTasksForRanking([parent, child], NOW).map((t) => t.id)
    ).toEqual(["parent"]);
  });
});

describe("isFillerCandidate", () => {
  test("a task nothing rides on is a filler candidate", () => {
    expect(isFillerCandidate(makeTask())).toBe(true);
  });

  test("a task its module gave an impact is not", () => {
    expect(isFillerCandidate(makeTask({ impact: 0.2 }))).toBe(false);
  });

  test("high-priority task is not a filler candidate", () => {
    expect(isFillerCandidate(makeTask({ priority: "high" }))).toBe(false);
  });

  test("a lifted task is never a filler candidate", () => {
    expect(isFillerCandidate(makeTask({ lift: 0.8 }))).toBe(false);
  });

  test("even a lift of 0 counts: a goal still vouches for it", () => {
    expect(isFillerCandidate(makeTask({ lift: 0 }))).toBe(false);
  });
});

describe("impactWorkIsUrgent", () => {
  test("true when work with impact is due within a day", () => {
    const pool = [makeTask({ impact: 0.3, dueDate: at(10) }), makeTask()];
    expect(impactWorkIsUrgent(pool, NOW)).toBe(true);
  });

  test("false when only work without impact is urgent", () => {
    const pool = [
      makeTask({ dueDate: at(2) }),
      makeTask({ impact: 0.3, dueDate: at(100) }),
    ];
    expect(impactWorkIsUrgent(pool, NOW)).toBe(false);
  });
});

describe("visibilityBoost", () => {
  // Ten pieces of work with impact; p80 is the 8th smallest (0.8).
  const pool = Array.from({ length: 10 }, (_, i) =>
    makeTask({ impact: (i + 1) / 10, dueDate: at(24 * 20) })
  );

  test("far-out work in the top fifth by impact is boosted", () => {
    expect(visibilityBoost(pool[9], pool, NOW)).toBeCloseTo(0.15, 6);
    expect(visibilityBoost(pool[8], pool, NOW)).toBeCloseTo(0.15, 6);
  });

  test("work at or below the 80th percentile is not", () => {
    expect(visibilityBoost(pool[7], pool, NOW)).toBe(0);
    expect(visibilityBoost(pool[0], pool, NOW)).toBe(0);
  });

  test("nothing within a week, nothing without a due date or impact", () => {
    const soon = makeTask({ impact: 1, dueDate: at(24 * 6) });
    const undated = makeTask({ impact: 1, dueDate: null });
    const plain = makeTask({ dueDate: at(24 * 20) });
    expect(visibilityBoost(soon, [...pool, soon], NOW)).toBe(0);
    expect(visibilityBoost(undated, [...pool, undated], NOW)).toBe(0);
    expect(visibilityBoost(plain, [...pool, plain], NOW)).toBe(0);
  });

  test("the percentile counts only work that carries impact", () => {
    const big = makeTask({ impact: 0.9, dueDate: at(24 * 20) });
    const small = makeTask({ impact: 0.1, dueDate: at(24 * 20) });
    const plain = Array.from({ length: 8 }, () =>
      makeTask({ dueDate: at(24 * 20) })
    );
    // With only two impact-bearing tasks, p80 is the larger one: no boost.
    expect(visibilityBoost(big, [big, small, ...plain], NOW)).toBe(0);
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

  test("filler is demoted when work with impact is urgent", () => {
    const courseworkUrgent = makeTask({ impact: 0.5, dueDate: at(10) });
    const personal = makeTask({ dueDate: at(100) });
    const pool = [courseworkUrgent, personal];
    const norm = new Map(pool.map((t) => [t.id, 0.5]));

    const personalScores = computeStage1Scores(personal, pool, NOW, null, norm);
    expect(personalScores.fillerDemoted).toBe(true);
  });

  test("a lifted personal task is not demoted alongside urgent coursework", () => {
    const courseworkUrgent = makeTask({ impact: 0.5, dueDate: at(10) });
    const goalPersonal = makeTask({ dueDate: at(100), lift: 0.8 });
    const pool = [courseworkUrgent, goalPersonal];
    const norm = new Map(pool.map((t) => [t.id, 0.5]));

    const goalScores = computeStage1Scores(goalPersonal, pool, NOW, null, norm);
    expect(goalScores.fillerDemoted).toBe(false);
  });
});

describe("orderTasksStage1 — lift path", () => {
  test("a task lifted by an important goal outranks low-impact coursework", () => {
    const courseworkLow = makeTask({ impact: 0.1, dueDate: at(100) });
    const goalTask = makeTask({ lift: 0.9, dueDate: at(100) });

    const ordered = orderTasksStage1([courseworkLow, goalTask], NOW, {
      slotMinutes: null,
    });

    expect(ordered[0].id).toBe(goalTask.id);
    expect(ordered[1].id).toBe(courseworkLow.id);
  });

  test("a lifted personal task ranks ahead of a demoted plain one", () => {
    const courseworkUrgent = makeTask({ impact: 0.5, dueDate: at(10) });
    const goalPersonal = makeTask({ lift: 0.8, dueDate: at(100) });
    const plainPersonal = makeTask({ dueDate: at(100) });

    const ordered = orderTasksStage1(
      [courseworkUrgent, goalPersonal, plainPersonal],
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
    const goalTask = makeTask({ lift: 0.95, dueDate: at(100) });

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

describe("skip cooldown", () => {
  test("a task not skipped is never cooling and takes no penalty", () => {
    const task = makeTask({ skipCount: 3, lastSkippedAt: null });
    expect(isSkipCooling(task, NOW)).toBe(false);
    expect(skipPenalty(task, NOW)).toBe(0);
  });

  test("cooling inside the window, not after it", () => {
    expect(isSkipCooling(makeTask({ lastSkippedAt: at(-1) }), NOW)).toBe(true);
    expect(isSkipCooling(makeTask({ lastSkippedAt: at(-3.9) }), NOW)).toBe(
      true
    );
    expect(isSkipCooling(makeTask({ lastSkippedAt: at(-4.1) }), NOW)).toBe(
      false
    );
  });

  test("a future lastSkippedAt (clock skew) still counts as cooling", () => {
    expect(isSkipCooling(makeTask({ lastSkippedAt: at(2) }), NOW)).toBe(true);
  });

  test("penalty grows with skip count and halves every 48h", () => {
    const once = makeTask({ skipCount: 1, lastSkippedAt: NOW });
    const thrice = makeTask({ skipCount: 3, lastSkippedAt: NOW });
    expect(skipPenalty(once, NOW)).toBeCloseTo(0.05, 6);
    expect(skipPenalty(thrice, NOW)).toBeCloseTo(0.15, 6);
    // Capped at 0.2 however many times it's been skipped.
    expect(skipPenalty(makeTask({ skipCount: 20, lastSkippedAt: NOW }), NOW)) //
      .toBeCloseTo(0.2, 6);
    expect(
      skipPenalty(makeTask({ skipCount: 3, lastSkippedAt: at(-48) }), NOW)
    ).toBeCloseTo(0.075, 6);
  });

  test("the skipped task loses the lead even when it is the DANGER one", () => {
    // This is the bug: the top task is top *because* it is urgent, so a
    // score-only penalty would leave it at #1 and Skip would do nothing.
    const overdue = makeTask({
      dueDate: at(-10),
      impact: 0.9,
      lastSkippedAt: at(-0.01),
      skipCount: 1,
    });
    const calm = makeTask({ dueDate: at(72), impact: 0.1 });

    const ordered = orderTasksStage1([overdue, calm], NOW, {
      slotMinutes: null,
    });
    expect(ordered.map((t) => t.id)).toEqual([calm.id, overdue.id]);
  });

  test("it returns to the lead once the cooldown lapses", () => {
    const overdue = makeTask({
      dueDate: at(-10),
      impact: 0.9,
      lastSkippedAt: at(-5),
      skipCount: 1,
    });
    const calm = makeTask({ dueDate: at(72), impact: 0.1 });

    const ordered = orderTasksStage1([overdue, calm], NOW, {
      slotMinutes: null,
    });
    expect(ordered[0]?.id).toBe(overdue.id);
  });

  test("cooling is a sort key, not a filter — Focus never runs dry", () => {
    const only = makeTask({ dueDate: at(1), lastSkippedAt: NOW, skipCount: 1 });
    expect(pickTopTaskStage1([only], NOW, { slotMinutes: null })?.id).toBe(
      only.id
    );
  });

  test("between two cooling tasks the normal ordering still decides", () => {
    const urgent = makeTask({
      dueDate: at(-10),
      impact: 0.9,
      lastSkippedAt: NOW,
      skipCount: 1,
    });
    const calm = makeTask({
      dueDate: at(72),
      impact: 0.1,
      lastSkippedAt: NOW,
      skipCount: 1,
    });

    const ordered = orderTasksStage1([calm, urgent], NOW, {
      slotMinutes: null,
    });
    expect(ordered[0]?.id).toBe(urgent.id);
  });
});
