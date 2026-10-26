import {
  NO_TARGETS,
  amount,
  dayTitle,
  dayTotals,
  entryMacros,
  isDay,
  leftLabel,
  leftOf,
  statusCount,
} from "@/modules/nutrition/macros";

const yogurt = { calories: 150, protein: 15, carbs: 8, fat: 4, servings: 1 };
const rice = { calories: 200, protein: 4, carbs: 45, fat: 0.5, servings: 1.5 };

describe("totals", () => {
  it("multiplies an entry's amounts by its servings", () => {
    expect(entryMacros(rice)).toEqual({
      calories: 300,
      protein: 6,
      carbs: 67.5,
      fat: 0.75,
    });
  });

  it("adds a day up, and is zero with nothing eaten", () => {
    expect(dayTotals([yogurt, rice])).toEqual({
      calories: 450,
      protein: 21,
      carbs: 75.5,
      fat: 4.75,
    });
    expect(dayTotals([])).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe("against targets", () => {
  const eaten = { calories: 2_150, protein: 98, carbs: 260, fat: 75 };
  const targets = { calories: 2_400, protein: 160, carbs: null, fat: 70 };

  it("says what's left of each target, and nothing where there's none", () => {
    expect(leftOf(eaten, targets)).toEqual({
      calories: 250,
      protein: 62,
      carbs: null,
      fat: -5,
    });
  });

  it("calls a passed ceiling over, and passed protein met", () => {
    expect(leftLabel("calories", 250)).toBe("250 left");
    expect(leftLabel("fat", -5)).toBe("5 over");
    expect(leftLabel("protein", -12)).toBe("met");
    expect(leftLabel("calories", 0.2)).toBe("met");
  });

  it("counts protein down in the top bar, or calories without a protein target", () => {
    expect(statusCount(eaten, targets)).toBe("62 g protein left");
    expect(statusCount({ ...eaten, protein: 170 }, targets)).toBe(
      "Protein met"
    );
    expect(statusCount(eaten, { ...targets, protein: null })).toBe(
      "250 kcal left"
    );
    expect(
      statusCount({ ...eaten, calories: 2_610 }, { ...targets, protein: null })
    ).toBe("210 kcal over");
    expect(statusCount(eaten, NO_TARGETS)).toBeNull();
  });

  it("prints amounts whole, with thousands marked", () => {
    expect(amount(2150.4)).toBe("2,150");
    expect(amount(0.5)).toBe("1");
  });
});

describe("days", () => {
  it("knows a real day when it sees one", () => {
    expect(isDay("2026-10-25")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-10-25T00:00")).toBe(false);
    expect(isDay(20261025)).toBe(false);
  });

  it("names the days near today, and dates the rest", () => {
    expect(dayTitle("2026-10-25", "2026-10-25")).toBe("Today");
    expect(dayTitle("2026-10-24", "2026-10-25")).toBe("Yesterday");
    expect(dayTitle("2026-10-26", "2026-10-25")).toBe("Tomorrow");
    expect(dayTitle("2026-10-21", "2026-10-25")).toBe("Wed, Oct 21");
  });
});
