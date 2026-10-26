import {
  dayIn,
  daysBetween,
  endOfDayIn,
  localDay,
  shiftDay,
  startOfDayIn,
  taskDay,
} from "@/lib/date-utils";

describe("days in a time zone", () => {
  // 01:30 UTC on the 20th is still the evening of the 19th in New York.
  const evening = new Date("2026-10-20T01:30:00.000Z");

  it("names the day a moment falls on where the person is", () => {
    expect(dayIn(evening, "America/New_York")).toBe("2026-10-19");
    expect(dayIn(evening, "UTC")).toBe("2026-10-20");
    expect(dayIn(evening, "Asia/Tokyo")).toBe("2026-10-20");
  });

  it("starts and ends a day in its zone, the long day of a clock change included", () => {
    expect(startOfDayIn("2026-10-19", "America/New_York").toISOString()).toBe(
      "2026-10-19T04:00:00.000Z"
    );
    expect(endOfDayIn("2026-10-19", "America/New_York").toISOString()).toBe(
      "2026-10-20T03:59:59.999Z"
    );
    // New York falls back on Nov 1, 2026: that day is 25 hours long.
    expect(endOfDayIn("2026-11-01", "America/New_York").toISOString()).toBe(
      "2026-11-02T04:59:59.999Z"
    );
    expect(endOfDayIn("2026-10-19", "UTC").toISOString()).toBe(
      "2026-10-19T23:59:59.999Z"
    );
  });

  it("steps whole days across months and years", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2027-01-01", -1)).toBe("2026-12-31");
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });
});

describe("taskDay", () => {
  const ymd = (d: Date) => localDay(d);

  it("reads a date stored without a time as that date", () => {
    expect(ymd(taskDay(new Date(Date.UTC(2026, 9, 30))))).toBe("2026-10-30");
  });

  it("reads a deadline with a time on its own local day", () => {
    // 11:59 PM here, whatever this machine's zone: its UTC date may be the next day.
    expect(ymd(taskDay(new Date(2026, 9, 30, 23, 59)))).toBe("2026-10-30");
    expect(ymd(taskDay(new Date(2026, 9, 30, 0, 30)))).toBe("2026-10-30");
  });
});
