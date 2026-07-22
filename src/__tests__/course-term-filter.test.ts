import {
  courseNameMatchesTerm,
  currentTermTokens,
  hasLiveAssignment,
} from "@/lib/canvas/course-term-filter";
import type { CanvasAssignment } from "@/lib/canvas/types";

describe("currentTermTokens", () => {
  it("mid-semester dates map to the in-progress term", () => {
    expect(currentTermTokens(new Date(2026, 2, 10))).toEqual(["Spring 2026"]);
    expect(currentTermTokens(new Date(2026, 9, 10))).toEqual(["Fall 2026"]);
  });

  it("summer sessions match both session and full-summer spellings", () => {
    expect(currentTermTokens(new Date(2026, 4, 15))).toContain("Summer 1 2026");
    expect(currentTermTokens(new Date(2026, 4, 15))).toContain("Summer 2026");
  });

  it("includes the upcoming term within the 45-day lookahead", () => {
    // Late July: Summer 2 in progress, Fall starts Sep 1 (< 45 days away).
    const tokens = currentTermTokens(new Date(2026, 6, 22));
    expect(tokens).toContain("Summer 2 2026");
    expect(tokens).toContain("Fall 2026");
    // Early June: Fall is > 45 days away.
    expect(currentTermTokens(new Date(2026, 5, 5))).not.toContain("Fall 2026");
  });

  it("December lookahead rolls into next year's Spring", () => {
    expect(currentTermTokens(new Date(2026, 11, 20))).toContain("Spring 2027");
  });
});

describe("courseNameMatchesTerm", () => {
  const tokens = ["Summer 2 2026", "Summer 2026", "Fall 2026"];

  it("matches registrar-style names case-insensitively", () => {
    expect(
      courseNameMatchesTerm(
        "CS3500 12345 Object-Oriented Design SEC 01 Fall 2026 [BOS-1-TR]",
        tokens
      )
    ).toBe(true);
    expect(
      courseNameMatchesTerm("RSO Boston summer 2026 Proctor Training", tokens)
    ).toBe(true);
  });

  it("rejects past terms and unnamed shells", () => {
    expect(
      courseNameMatchesTerm(
        "CS 2500 Fundamentals of Computer Science 1 (Spertus) Fall 2024",
        tokens
      )
    ).toBe(false);
    expect(courseNameMatchesTerm("CS 2100 Assignments", tokens)).toBe(false);
  });
});

describe("hasLiveAssignment", () => {
  const now = new Date(2026, 6, 22);
  const assignment = (due_at: string | null): CanvasAssignment =>
    ({ id: 1, name: "a", due_at }) as CanvasAssignment;

  it("future or recent due dates count as live", () => {
    expect(hasLiveAssignment([assignment("2026-09-10T00:00:00Z")], now)).toBe(
      true
    );
    expect(hasLiveAssignment([assignment("2026-07-10T00:00:00Z")], now)).toBe(
      true
    );
  });

  it("old or undated assignments do not", () => {
    expect(hasLiveAssignment([assignment("2025-12-05T00:00:00Z")], now)).toBe(
      false
    );
    expect(hasLiveAssignment([assignment(null)], now)).toBe(false);
    expect(hasLiveAssignment([], now)).toBe(false);
  });
});
