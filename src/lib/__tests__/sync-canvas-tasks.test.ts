import type { CanvasAssignment } from "../canvas/types";
import {
  mapStatusFromSubmission,
  shouldSkipAssignment,
} from "../canvas/sync-canvas-tasks";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const now = new Date("2026-09-30T12:00:00Z");

// Canvas sends `has_submitted_submissions` (course-wide: any student has
// submitted). It is no longer typed, but real payloads still carry it.
function assignment(
  workflowState: string | undefined,
  extra: Record<string, unknown> = {}
): CanvasAssignment {
  return {
    id: 3310774,
    name: "Assignment 4 (UNOCAL)",
    course_id: 1,
    due_at: "2026-10-02T11:00:00Z",
    points_possible: 2,
    has_submitted_submissions: true,
    submission: workflowState ? { workflow_state: workflowState } : null,
    ...extra,
  } as unknown as CanvasAssignment;
}

describe("Canvas sync and classmates' submissions", () => {
  it("creates a task the user hasn't submitted even when classmates have", () => {
    expect(shouldSkipAssignment(assignment("unsubmitted"), now, true)).toBe(false);
  });

  it("skips creating a task the user already submitted", () => {
    expect(shouldSkipAssignment(assignment("submitted"), now, true)).toBe(true);
    expect(shouldSkipAssignment(assignment("graded"), now, true)).toBe(true);
  });

  it("never marks a task completed because classmates submitted", () => {
    expect(mapStatusFromSubmission(assignment(undefined)).taskStatus).toBe("todo");
    expect(mapStatusFromSubmission(assignment("unsubmitted")).taskStatus).toBe("todo");
  });
});
