import {
  earningsFor,
  formatHours,
  hoursOf,
  isWorked,
  periodOf,
  sumHours,
  weekOf,
} from "@/modules/work/hours";

const shift = (
  start: string,
  end: string,
  extra: Partial<Parameters<typeof hoursOf>[0]> = {}
) => ({
  start: new Date(start),
  end: new Date(end),
  workedStart: null,
  workedEnd: null,
  dropped: false,
  ...extra,
});

describe("hours", () => {
  const close = shift("2026-10-28T00:45:00Z", "2026-10-28T04:15:00Z");

  it("counts a shift past midnight to the minute", () => {
    expect(hoursOf(close)).toBe(3.5);
  });

  it("counts worked times over scheduled ones", () => {
    expect(
      hoursOf({ ...close, workedEnd: new Date("2026-10-28T04:45:00Z") })
    ).toBe(4);
  });

  it("is worked once it ends, unless it was dropped", () => {
    const after = new Date("2026-10-28T05:00:00Z");
    expect(isWorked(close, new Date("2026-10-28T03:00:00Z"))).toBe(false);
    expect(isWorked(close, after)).toBe(true);
    expect(isWorked({ ...close, dropped: true }, after)).toBe(false);
  });

  it("adds up without float noise and prices it", () => {
    const tenth = shift("2026-10-01T00:00:00Z", "2026-10-01T00:06:00Z");
    expect(sumHours([tenth, tenth, tenth])).toBe(0.3);
    expect(earningsFor(14.5, 15.5)).toBe(224.75);
    expect(earningsFor(14.5, null)).toBeNull();
  });

  it("says hours the way a title does", () => {
    expect(formatHours(7)).toBe("7");
    expect(formatHours(7.5)).toBe("7.5");
    expect(formatHours(7.25)).toBe("7.25");
  });
});

describe("periodOf", () => {
  it("counts periods forward and back from any start", () => {
    expect(periodOf("2026-10-27", "2026-10-19", 14)).toEqual({
      first: "2026-10-19",
      last: "2026-11-01",
    });
    expect(periodOf("2026-11-02", "2026-10-19", 14)).toEqual({
      first: "2026-11-02",
      last: "2026-11-15",
    });
    expect(periodOf("2026-10-18", "2026-10-19", 14)).toEqual({
      first: "2026-10-05",
      last: "2026-10-18",
    });
  });

  it("crosses the end of daylight saving without drifting", () => {
    expect(periodOf("2026-11-09", "2026-10-26", 7)).toEqual({
      first: "2026-11-09",
      last: "2026-11-15",
    });
  });
});

describe("weekOf", () => {
  it("starts on Sunday or Monday", () => {
    // 2026-10-27 is a Tuesday.
    expect(weekOf("2026-10-27", "sunday")).toEqual({
      first: "2026-10-25",
      last: "2026-10-31",
    });
    expect(weekOf("2026-10-27", "monday")).toEqual({
      first: "2026-10-26",
      last: "2026-11-01",
    });
    expect(weekOf("2026-10-26", "monday").first).toBe("2026-10-26");
  });
});
