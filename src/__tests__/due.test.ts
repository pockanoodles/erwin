import { dateOnlyDay, dueBy, dueDay } from "@/lib/sigwald/due";
import { toTaskForRanking } from "@/lib/sigwald/focus-queue-core";
import { isDangerForFocus } from "@/lib/sigwald/rank-stage1";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const NY = "America/New_York";
// The task form and the sheet store a picked date at UTC midnight.
const formWednesday = new Date("2026-10-28T00:00:00.000Z");
// ops stores a bare date at local midnight: 00:00 in New York.
const opsWednesday = new Date("2026-10-28T04:00:00.000Z");
// Canvas's 8 PM deadline on Tuesday is a real moment that lands on UTC midnight.
const canvasTuesday8pm = new Date("2026-10-28T00:00:00.000Z");

describe("reading a due date", () => {
  it("names the day a date picked without a time stands for", () => {
    expect(dateOnlyDay(formWednesday, null, NY)).toBe("2026-10-28");
    expect(dateOnlyDay(opsWednesday, "VENTURE:ops", NY)).toBe("2026-10-28");
    expect(dateOnlyDay(formWednesday, "GOOGLE", NY)).toBe("2026-10-28");
  });

  it("takes a real moment as it is, a module's even on midnight", () => {
    expect(
      dateOnlyDay(new Date("2026-10-29T03:59:59.000Z"), null, NY)
    ).toBeNull();
    expect(dateOnlyDay(canvasTuesday8pm, "CANVAS", NY)).toBeNull();
    expect(dueBy(canvasTuesday8pm, "CANVAS", NY)).toBe(canvasTuesday8pm);
    expect(dueDay(canvasTuesday8pm, "CANVAS", NY)).toBe("2026-10-27");
  });

  it("makes a date with no time due by the end of its day where the person is", () => {
    expect(dueBy(formWednesday, null, NY).toISOString()).toBe(
      "2026-10-29T03:59:59.999Z"
    );
    expect(dueBy(opsWednesday, "VENTURE:ops", NY).toISOString()).toBe(
      "2026-10-29T03:59:59.999Z"
    );
    expect(dueBy(formWednesday, null, "Asia/Tokyo").toISOString()).toBe(
      "2026-10-28T14:59:59.999Z"
    );
    expect(dueDay(formWednesday, null, NY)).toBe("2026-10-28");
  });
});

describe("ranking a date with no time", () => {
  const task = (source: string | null, due: Date) =>
    toTaskForRanking(
      {
        id: "t",
        title: "Renew library books",
        status: "todo",
        source,
        dueDate: due,
        unlockAt: null,
        lockAt: null,
        duration: 30,
        impact: null,
        closedAt: null,
        priority: "medium",
        skipCount: 0,
        lastSkippedAt: null,
        createdAt: new Date("2026-10-20T12:00:00.000Z"),
      },
      NY
    );

  it("isn't in danger the evening before its day", () => {
    // 9:30 PM on Tuesday in New York.
    const tuesdayNight = new Date("2026-10-28T01:30:00.000Z");
    expect(isDangerForFocus(task(null, formWednesday), tuesdayNight)).toBe(
      false
    );
    // A Canvas deadline at 8 PM Tuesday really is past.
    expect(
      isDangerForFocus(task("CANVAS", canvasTuesday8pm), tuesdayNight)
    ).toBe(true);
  });

  it("is late once its day is over", () => {
    const thursdayMorning = new Date("2026-10-29T13:00:00.000Z");
    expect(isDangerForFocus(task(null, formWednesday), thursdayMorning)).toBe(
      true
    );
  });
});
