import {
  CADENCE_CHOICES,
  cadenceLabel,
  daysBetween,
  lastLabel,
  nextLabel,
  nextSession,
  planWorkout,
  sameCadence,
} from "@/modules/training/cadence";
import {
  convertWeight,
  entryText,
  keptEntries,
  prefillEntries,
  sessionSummary,
} from "@/modules/training/sets";
import { routinesInView } from "@/modules/training/store";
import type { RoutineRow } from "@/modules/training/types";

const DAY = 86_400_000;
const now = new Date("2026-10-25T12:00:00.000Z");

const routine = (
  over: Partial<Parameters<typeof planWorkout>[0]> = {}
): Parameters<typeof planWorkout>[0] => ({
  name: "Push day",
  cadenceDays: 3,
  minutes: 60,
  lastDoneAt: new Date("2026-10-24T22:00:00.000Z"),
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  archived: false,
  ...over,
});

describe("cadence", () => {
  it("names each choice the way people say it", () => {
    expect(CADENCE_CHOICES.map(cadenceLabel)).toEqual([
      "Every day",
      "Every 2 days",
      "3× a week",
      "Every 3 days",
      "2× a week",
      "Every week",
      "Every 2 weeks",
    ]);
    expect(cadenceLabel(10)).toBe("Every 10 days");
  });

  it("treats a stored 7/3 as the choice it came from", () => {
    expect(sameCadence(2.3333333333333335, 7 / 3)).toBe(true);
    expect(sameCadence(2, 7 / 3)).toBe(false);
    expect(sameCadence(null, null)).toBe(true);
  });

  it("puts the next session a cadence after the last, or after it was added", () => {
    expect(nextSession(routine())?.toISOString()).toBe(
      "2026-10-27T22:00:00.000Z"
    );
    expect(nextSession(routine({ lastDoneAt: null }))?.toISOString()).toBe(
      "2026-09-04T00:00:00.000Z"
    );
    expect(nextSession(routine({ cadenceDays: null }))).toBeNull();
    expect(nextSession(routine({ archived: true }))).toBeNull();
  });
});

describe("planWorkout", () => {
  it("is due on the session's day where they live, shown shortly before", () => {
    // 22:00 UTC on the 27th is still the 27th in New York, the 28th in Tokyo.
    const ny = planWorkout(routine(), [], now, "America/New_York");
    expect(ny?.dueDate.toISOString()).toBe("2026-10-27T00:00:00.000Z");
    expect(ny?.postponedUntil?.toISOString()).toBe("2026-10-26T06:00:00.000Z");
    const tokyo = planWorkout(routine(), [], now, "Asia/Tokyo");
    expect(tokyo?.dueDate.toISOString()).toBe("2026-10-28T00:00:00.000Z");
  });

  it("says the cadence, the last session and what to do", () => {
    const plan = planWorkout(
      routine(),
      ["Bench press 3 × 8 @ 60 kg", "Dips 3 × 12"],
      now,
      "America/New_York"
    );
    expect(plan?.title).toBe("Push day");
    expect(plan?.duration).toBe(60);
    expect(plan?.description).toBe(
      "Every 3 days. Last done 2026-10-24.\nBench press 3 × 8 @ 60 kg\nDips 3 × 12"
    );
  });

  it("shows a late session now, and plans nothing without a schedule", () => {
    const late = planWorkout(
      routine({ lastDoneAt: new Date(now.getTime() - 10 * DAY) }),
      [],
      now,
      "UTC"
    );
    expect(late?.postponedUntil).toBeNull();
    expect(late!.dueDate.getTime()).toBeLessThan(now.getTime());
    expect(
      planWorkout(routine({ cadenceDays: null }), [], now, "UTC")
    ).toBeNull();
  });
});

describe("day labels", () => {
  it("counts calendar days, not 24-hour spans", () => {
    expect(daysBetween("2026-10-25", "2026-10-27")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(nextLabel("2026-10-25", "2026-10-25")).toBe("today");
    expect(nextLabel("2026-10-26", "2026-10-25")).toBe("tomorrow");
    expect(nextLabel("2026-10-23", "2026-10-25")).toBe("2 days overdue");
    expect(nextLabel("2026-11-15", "2026-10-25")).toBe("in 3 weeks");
    expect(nextLabel(null, "2026-10-25")).toBe("");
    expect(lastLabel(null, "2026-10-25")).toBe("never");
  });
});

describe("prefillEntries", () => {
  const plan = [
    { name: "Bench press", sets: 3, reps: 8 },
    { name: "Dips", sets: 3, reps: 12 },
    { name: "Overhead press", sets: 3, reps: 10 },
  ];
  const history = [
    {
      unit: "kg" as const,
      entries: [
        { exercise: "Bench press", sets: 2, reps: 8, weight: 62.5 },
        { exercise: "bench press ", sets: 1, reps: 6, weight: 62.5 },
        { exercise: "Face pulls", sets: 3, reps: 15, weight: 10 },
      ],
    },
    {
      unit: "lb" as const,
      entries: [{ exercise: "Dips", sets: 3, reps: 10, weight: 20 }],
    },
  ];

  it("brings each planned exercise's lines from the last time it was done", () => {
    expect(prefillEntries(plan, history, "kg")).toEqual([
      { exercise: "Bench press", sets: 2, reps: 8, weight: 62.5 },
      { exercise: "bench press ", sets: 1, reps: 6, weight: 62.5 },
      // Logged in pounds last time: 20 lb is 9 kg to the nearest half.
      { exercise: "Dips", sets: 3, reps: 10, weight: 9 },
      // Never done: the plan's sets and reps, no weight yet.
      { exercise: "Overhead press", sets: 3, reps: 10, weight: null },
    ]);
  });

  it("repeats the latest session when there's no plan", () => {
    expect(prefillEntries([], history, "kg")).toEqual(history[0].entries);
    expect(prefillEntries([], [], "kg")).toEqual([]);
  });
});

describe("sets", () => {
  it("converts weights to the nearest half in the other unit", () => {
    expect(convertWeight(60, "kg", "lb")).toBe(132.5);
    expect(convertWeight(135, "lb", "kg")).toBe(61);
    expect(convertWeight(60, "kg", "kg")).toBe(60);
  });

  it("writes a line the way a log reads", () => {
    const bench = { exercise: "Bench press", sets: 3, reps: 8, weight: 60 };
    expect(entryText(bench, "kg")).toBe("3 × 8 @ 60 kg");
    expect(entryText({ ...bench, weight: 102.5 }, "lb")).toBe(
      "3 × 8 @ 102.5 lb"
    );
    expect(entryText({ ...bench, weight: null }, "kg")).toBe("3 × 8");
    expect(entryText({ ...bench, reps: null, weight: null }, "kg")).toBe(
      "3 sets"
    );
    expect(
      sessionSummary(
        [bench, { exercise: "Dips", sets: 3, reps: 12, weight: null }],
        "kg"
      )
    ).toBe("Bench press 3 × 8 @ 60 kg · Dips 3 × 12");
  });

  it("drops lines left without an exercise or sets", () => {
    expect(
      keptEntries([
        { exercise: "  Squat ", sets: 5, reps: 5, weight: 100 },
        { exercise: "", sets: 3, reps: 8, weight: null },
        { exercise: "Lunges", sets: 0, reps: 8, weight: null },
      ])
    ).toEqual([{ exercise: "Squat", sets: 5, reps: 5, weight: 100 }]);
  });
});

describe("routinesInView", () => {
  const row = (name: string, nextDue: string | null): RoutineRow => ({
    id: name,
    name,
    notes: null,
    cadenceDays: nextDue ? 3 : null,
    minutes: 60,
    plan: [],
    lastDoneAt: null,
    archived: false,
    createdAt: now.toISOString(),
    nextDue,
    sessions: 0,
  });

  it("puts the soonest session first and unscheduled routines last, by name", () => {
    const routines = [
      row("Yoga", null),
      row("Legs", "2026-10-27"),
      row("Push", "2026-10-24"),
      row("Pull", "2026-10-27"),
      row("Mobility", null),
    ];
    expect(routinesInView("routines", routines, []).map((r) => r.name)).toEqual(
      ["Push", "Legs", "Pull", "Mobility", "Yoga"]
    );
    expect(routinesInView("archived", routines, [row("Old", null)])).toEqual([
      row("Old", null),
    ]);
  });
});
