import { type ShareItem, gradeShares } from "@/lib/canvas/grade-share";

const item = (
  id: string,
  groupId: string | null,
  points: number | null,
  extra: Partial<ShareItem> = {}
): ShareItem => ({
  id,
  groupId,
  pointsPossible: points,
  omitFromFinalGrade: false,
  gradingType: "points",
  ...extra,
});

describe("gradeShares", () => {
  it("splits a weighted group's weight across its points", () => {
    // SmartBook: ten 100-point chapters in a 5% group are half a percent each.
    const chapters = Array.from({ length: 10 }, (_, i) =>
      item(`ch${i}`, "smartbook", 100)
    );
    const shares = gradeShares(
      [...chapters, item("test", "tests", 100)],
      [
        { id: "smartbook", weight: 5 },
        { id: "tests", weight: 45 },
      ],
      true
    );
    expect(shares.get("ch0")).toBeCloseTo(0.005, 6);
    expect(shares.get("test")).toBeCloseTo(0.45, 6);
  });

  it("gives work in a zero-weight group no share of the grade", () => {
    const shares = gradeShares(
      [item("practice", "practice", 100)],
      [{ id: "practice", weight: 0 }],
      true
    );
    expect(shares.get("practice")).toBe(0);
  });

  it("divides by the course's points when groups aren't weighted", () => {
    const shares = gradeShares(
      [item("pitch", "a", 75), item("exam", "b", 300), item("quiz", "b", 125)],
      [
        { id: "a", weight: 0 },
        { id: "b", weight: 0 },
      ],
      false
    );
    expect(shares.get("pitch")).toBeCloseTo(0.15, 6);
    expect(shares.get("exam")).toBeCloseTo(0.6, 6);
  });

  it("counts nothing omitted, ungraded or pointless, in the share or the total", () => {
    const shares = gradeShares(
      [
        item("real", "g", 100),
        item("omitted", "g", 100, { omitFromFinalGrade: true }),
        item("survey", "g", 10, { gradingType: "not_graded" }),
        item("peer", "g", 0),
        item("unscored", "g", null),
      ],
      [{ id: "g", weight: 20 }],
      true
    );
    expect(shares.get("real")).toBeCloseTo(0.2, 6);
    for (const id of ["omitted", "survey", "peer", "unscored"])
      expect(shares.get(id)).toBe(0);
  });

  it("gives an ungrouped assignment in a weighted course nothing", () => {
    expect(gradeShares([item("loose", null, 50)], [], true).get("loose")).toBe(
      0
    );
  });
});
