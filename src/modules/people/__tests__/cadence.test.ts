import {
  agoLabel,
  cadenceLabel,
  dueLabel,
  nextCheckIn,
  planReachOut,
} from "@/modules/people/cadence";
import { peopleInView } from "@/modules/people/store";
import type { PersonRow } from "@/modules/people/types";

const DAY = 86_400_000;
const now = new Date("2026-10-25T12:00:00.000Z");

const person = (over: Partial<Parameters<typeof planReachOut>[0]> = {}) => ({
  name: "Sam Lee",
  org: "Acme",
  cadenceDays: 28,
  lastContactAt: new Date(now.getTime() - 10 * DAY),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  archived: false,
  ...over,
});

describe("nextCheckIn", () => {
  it("is a cadence after the last conversation", () => {
    expect(nextCheckIn(person())?.getTime()).toBe(now.getTime() + 18 * DAY);
  });

  it("counts from when they were added if you've never talked", () => {
    const p = person({ lastContactAt: null });
    expect(nextCheckIn(p)?.getTime()).toBe(p.createdAt.getTime() + 28 * DAY);
  });

  it("is never without a cadence, or once archived", () => {
    expect(nextCheckIn(person({ cadenceDays: null }))).toBeNull();
    expect(nextCheckIn(person({ archived: true }))).toBeNull();
  });
});

describe("planReachOut", () => {
  it("is due on the check-in's day, hidden until a few days before", () => {
    const plan = planReachOut(person(), now, "UTC");
    expect(plan?.title).toBe("Reach out to Sam Lee");
    expect(plan?.dueDate.toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(plan?.postponedUntil?.toISOString()).toBe(
      "2026-11-09T00:00:00.000Z"
    );
  });

  it("takes the day from their time zone, so an evening talk isn't due a day late", () => {
    // 21:30 in New York is already the next day in UTC.
    const evening = person({
      cadenceDays: 7,
      lastContactAt: new Date("2026-10-20T01:30:00.000Z"),
    });
    expect(
      planReachOut(evening, now, "America/New_York")?.dueDate.toISOString()
    ).toBe("2026-10-26T00:00:00.000Z");
    expect(planReachOut(evening, now, "UTC")?.dueDate.toISOString()).toBe(
      "2026-10-27T00:00:00.000Z"
    );
  });

  it("shows it now once it's that close, or late", () => {
    const close = planReachOut(
      person({ lastContactAt: new Date(now.getTime() - 26 * DAY) }),
      now,
      "UTC"
    );
    expect(close?.postponedUntil).toBeNull();
    const late = planReachOut(
      person({ lastContactAt: new Date(now.getTime() - 40 * DAY) }),
      now,
      "UTC"
    );
    expect(late?.postponedUntil).toBeNull();
    expect(late!.dueDate.getTime()).toBeLessThan(now.getTime());
  });

  it("keeps a short cadence's lead to a quarter of it", () => {
    const weekly = planReachOut(
      person({ cadenceDays: 8, lastContactAt: now }),
      now,
      "UTC"
    );
    expect(weekly?.postponedUntil?.toISOString()).toBe(
      "2026-10-31T00:00:00.000Z"
    );
  });

  it("plans nothing without a cadence", () => {
    expect(planReachOut(person({ cadenceDays: null }), now, "UTC")).toBeNull();
  });
});

describe("labels", () => {
  it("says the cadence the way a sentence ends", () => {
    expect(cadenceLabel(7)).toBe("week");
    expect(cadenceLabel(14)).toBe("2 weeks");
    expect(cadenceLabel(30)).toBe("month");
    expect(cadenceLabel(90)).toBe("3 months");
    expect(cadenceLabel(10)).toBe("10 days");
  });

  it("says when it's due and how long ago you talked", () => {
    expect(dueLabel(new Date(now.getTime() - 3 * DAY), now)).toBe(
      "3 days overdue"
    );
    expect(dueLabel(now, now)).toBe("today");
    expect(dueLabel(new Date(now.getTime() + DAY), now)).toBe("tomorrow");
    expect(dueLabel(new Date(now.getTime() + 21 * DAY), now)).toBe(
      "in 3 weeks"
    );
    expect(agoLabel(null, now)).toBe("never");
    expect(agoLabel(new Date(now.getTime() - 12 * DAY), now)).toBe(
      "12 days ago"
    );
  });
});

describe("peopleInView", () => {
  const row = (id: string, next: number | null): PersonRow => ({
    id,
    name: id,
    org: null,
    role: null,
    email: null,
    phone: null,
    link: null,
    notes: null,
    cadenceDays: next == null ? null : 30,
    lastContactAt: null,
    archived: false,
    createdAt: now.toISOString(),
    nextCheckIn:
      next == null ? null : new Date(now.getTime() + next * DAY).toISOString(),
  });
  const people = [
    row("b-none", null),
    row("late", -2),
    row("soon", 5),
    row("later", 20),
    row("a-none", null),
  ];

  it("puts the soonest check-in first and people without a cadence last, by name", () => {
    expect(peopleInView("all", people, [], now).map((p) => p.id)).toEqual([
      "late",
      "soon",
      "later",
      "a-none",
      "b-none",
    ]);
  });

  it("shows only who's due within a week in Due", () => {
    expect(peopleInView("due", people, [], now).map((p) => p.id)).toEqual([
      "late",
      "soon",
    ]);
  });
});
