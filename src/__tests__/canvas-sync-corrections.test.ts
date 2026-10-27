jest.mock("@/lib/prisma", () => ({
  prisma: {
    courseAssignmentGroup: { upsert: jest.fn(), deleteMany: jest.fn() },
    courseAssignment: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    canvasCorrection: { findMany: jest.fn(), update: jest.fn() },
  },
}));

import type { CanvasClient } from "@/lib/canvas/canvas-client";
import { syncCourseGradebook } from "@/lib/canvas/sync-canvas-gradebook";
import type { CanvasAssignment, CanvasCourse } from "@/lib/canvas/types";
import { prisma } from "@/lib/prisma";

const db = prisma as unknown as {
  courseAssignment: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  courseAssignmentGroup: { deleteMany: jest.Mock };
  canvasCorrection: { findMany: jest.Mock; update: jest.Mock };
};

const now = new Date("2026-10-27T16:00:00Z");
const mktg = { id: 1, name: "Introduction to Marketing", course_code: "MKTG2201.22992.202710" } as CanvasCourse;
const report: CanvasAssignment = {
  id: 900,
  name: "Simulation - Quarter 3 Report - 1 per team turned in",
  course_id: 1,
  due_at: "2026-10-24T03:59:59Z",
  lock_at: "2026-10-24T05:00:00Z",
  points_possible: 50,
  submission_types: ["online_upload"],
  submission: null,
};
const teamCopy = {
  id: "c1",
  assignmentCanvasId: "900",
  nameMatch: null,
  submissionType: null,
  field: "state",
  op: "set",
  value: "submitted",
  reason: "A teammate turned in the group copy",
  canvasValue: "missed",
  createdAt: new Date("2026-10-27T12:00:00Z"),
};
const options = { now, selfId: 1, timeZone: "America/New_York", courseGrade: null };

function client(assignment: CanvasAssignment): CanvasClient {
  return {
    listAssignmentGroups: jest.fn().mockResolvedValue([]),
    listAssignments: jest.fn().mockResolvedValue([assignment]),
    listSubmissions: jest.fn().mockResolvedValue([]),
    listQuizzes: jest.fn().mockResolvedValue([]),
  } as unknown as CanvasClient;
}

const stored = (state: string, corrections: unknown = null) => ({
  canvasId: "900",
  dueAt: new Date(report.due_at!),
  state,
  score: null,
  grade: null,
  comments: null,
  corrections,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.courseAssignment.upsert.mockResolvedValue({ id: "row" });
  db.courseAssignment.deleteMany.mockResolvedValue({ count: 0 });
  db.courseAssignmentGroup.deleteMany.mockResolvedValue({ count: 0 });
  db.canvasCorrection.findMany.mockResolvedValue([teamCopy]);
});

describe("syncCourseGradebook with corrections", () => {
  it("stores the corrected state beside what Canvas said, and doesn't call it missing", async () => {
    db.courseAssignment.findMany.mockResolvedValue([stored("missed")]);

    const result = await syncCourseGradebook(client(report), "mktg-row", mktg, options);

    expect(result.planned.get("900")?.state).toBe("submitted");
    const { update } = db.courseAssignment.upsert.mock.calls[0][0];
    expect(update.state).toBe("submitted");
    expect(update.corrections).toEqual([
      { id: "c1", field: "state", canvas: "missed", value: "submitted", reason: teamCopy.reason },
    ]);
    expect(result.activity).toEqual([]);
    expect(db.canvasCorrection.update).not.toHaveBeenCalled();
  });

  it("retires the correction and says so once Canvas grades the work", async () => {
    db.courseAssignment.findMany.mockResolvedValue([
      stored("submitted", [{ id: "c1", field: "state", canvas: "missed", value: "submitted", reason: "" }]),
    ]);
    const graded = { ...report, submission: { id: 5, workflow_state: "graded", score: 46 } };

    const result = await syncCourseGradebook(client(graded), "mktg-row", mktg, options);

    expect(result.planned.get("900")?.state).toBe("graded");
    expect(db.canvasCorrection.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { retiredAt: now, retiredNote: "Canvas now says graded" },
    });
    expect(result.activity.map((a) => a.kind)).toEqual(["CORRECTION_RETIRED", "GRADE_POSTED"]);
  });
});
