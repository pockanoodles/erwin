import { hexForDate, hexLabel, hexOf } from "../erwin/hex";

describe("hexForDate", () => {
  it("maps January 1 to hex 1", () => {
    const hex = hexForDate(new Date("2026-01-01T00:00:00.000Z"));
    expect(hex.index).toBe(1);
    expect(hex.startDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(hex.endDate.toISOString()).toBe("2026-02-28T23:59:59.999Z");
  });

  it("covers leap-year February in hex 1", () => {
    const hex = hexForDate(new Date("2028-02-29T12:00:00.000Z"));
    expect(hex.index).toBe(1);
    expect(hex.endDate.toISOString()).toBe("2028-02-29T23:59:59.999Z");
  });

  it("maps late July to hex 4 (Jul–Aug)", () => {
    const hex = hexForDate(new Date("2026-07-25T04:00:00.000Z"));
    expect(hex.index).toBe(4);
    expect(hex.startDate.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(hex.endDate.toISOString()).toBe("2026-08-31T23:59:59.999Z");
  });

  it("maps December 31 to hex 6", () => {
    const hex = hexForDate(new Date("2026-12-31T23:59:59.000Z"));
    expect(hex.index).toBe(6);
    expect(hex.endDate.toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("first instant of a boundary month starts the next hex", () => {
    expect(hexForDate(new Date("2026-06-30T23:59:59.999Z")).index).toBe(3);
    expect(hexForDate(new Date("2026-07-01T00:00:00.000Z")).index).toBe(4);
  });
});

describe("hexLabel", () => {
  it("formats index and month pair", () => {
    expect(hexLabel(hexOf(2026, 4))).toBe("Hex 4 · Jul–Aug 2026");
    expect(hexLabel(hexOf(2027, 1))).toBe("Hex 1 · Jan–Feb 2027");
    expect(hexLabel(hexOf(2026, 6))).toBe("Hex 6 · Nov–Dec 2026");
  });
});
