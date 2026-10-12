import { parseShiftWeek } from "../erwin/shifts";

const week = (shifts: unknown[], extra: Record<string, unknown> = {}) => ({
  source: "im",
  feedName: "IM Work",
  windowStart: "2026-10-12T00:00:00-04:00",
  windowEnd: "2026-10-19T00:00:00-04:00",
  shifts,
  ...extra,
});

const soccer = {
  key: "2026-10-16T19:15|7v7 Soccer",
  title: "IM · 7v7 Soccer",
  start: "2026-10-16T19:15:00-04:00",
  end: "2026-10-17T00:15:00-04:00",
  location: "Carter Field 1A/1B",
};

describe("parseShiftWeek", () => {
  it("accepts a week whose shift runs past midnight", () => {
    const parsed = parseShiftWeek(week([soccer]));
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.shifts[0].start.toISOString()).toBe("2026-10-16T23:15:00.000Z");
    expect(parsed.shifts[0].end.toISOString()).toBe("2026-10-17T04:15:00.000Z");
    expect(parsed.color).toBe("#E8590CFF");
  });

  it("treats an empty list as a week with no shifts", () => {
    const parsed = parseShiftWeek(week([]));
    expect(typeof parsed).not.toBe("string");
  });

  it("rejects a timestamp without an offset", () => {
    expect(parseShiftWeek(week([{ ...soccer, start: "2026-10-16T19:15:00" }]))).toMatch(/offset/);
  });

  it("rejects a shift starting outside the window", () => {
    const early = { ...soccer, start: "2026-10-11T19:15:00-04:00", end: "2026-10-11T23:00:00-04:00" };
    expect(parseShiftWeek(week([early]))).toMatch(/outside the window/);
  });

  it("rejects duplicate keys and backwards shifts", () => {
    expect(parseShiftWeek(week([soccer, soccer]))).toMatch(/duplicate/);
    expect(parseShiftWeek(week([{ ...soccer, end: soccer.start }]))).toMatch(/ends before/);
  });

  it("rejects a window longer than a schedule week", () => {
    expect(parseShiftWeek(week([], { windowEnd: "2026-10-30T00:00:00-04:00" }))).toMatch(/8 days/);
  });

  it("requires a slug source", () => {
    expect(parseShiftWeek(week([], { source: "IM Work" }))).toMatch(/slug/);
  });
});
