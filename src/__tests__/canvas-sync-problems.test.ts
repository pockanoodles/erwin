jest.mock("@/lib/prisma", () => ({
  prisma: {
    courseAnnouncement: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    courseActivity: { updateMany: jest.fn() },
    courseConversation: { findUnique: jest.fn(), upsert: jest.fn() },
    courseAssignmentGroup: { upsert: jest.fn(), deleteMany: jest.fn() },
    courseAssignment: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  },
}));

import {
  type CanvasClient,
  CanvasApiError,
  isHiddenFromStudents,
} from "@/lib/canvas/canvas-client";
import { syncCourseGradebook } from "@/lib/canvas/sync-canvas-gradebook";
import { syncCanvasNews } from "@/lib/canvas/sync-canvas-news";
import { courseLabel, syncErrorText, syncProblem } from "@/lib/canvas/sync-problems";
import type { CanvasAssignment, CanvasCourse } from "@/lib/canvas/types";
import { prisma } from "@/lib/prisma";

const db = prisma as unknown as {
  courseAnnouncement: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  courseConversation: { findUnique: jest.Mock; upsert: jest.Mock };
  courseAssignment: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
  courseAssignmentGroup: { deleteMany: jest.Mock };
};

const now = new Date("2026-10-23T10:00:00Z");
const DISABLED = '{"message":"That page has been disabled for this course"}';
const mism = { id: 265615, name: "Database Design", course_code: "MISM2301.10244.202710" } as CanvasCourse;
const schm = { id: 264719, name: "Operations", course_code: "SCHM2301.10917.202710" } as CanvasCourse;

function fakeClient(methods: Record<string, jest.Mock>): CanvasClient {
  return methods as unknown as CanvasClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.courseAnnouncement.findMany.mockResolvedValue([]);
  db.courseAnnouncement.deleteMany.mockResolvedValue({ count: 0 });
  db.courseConversation.findUnique.mockResolvedValue(null);
  db.courseAssignment.findMany.mockResolvedValue([]);
  db.courseAssignment.upsert.mockResolvedValue({ id: "assignment-row" });
  db.courseAssignment.deleteMany.mockResolvedValue({ count: 0 });
  db.courseAssignmentGroup.deleteMany.mockResolvedValue({ count: 0 });
});

describe("isHiddenFromStudents", () => {
  it("reads a page the course turned off as hidden", () => {
    expect(isHiddenFromStudents(new CanvasApiError(404, DISABLED))).toBe(true);
    expect(isHiddenFromStudents(new CanvasApiError(401, "unauthorized"))).toBe(true);
  });

  it("counts throttling, server errors and network failures as failures", () => {
    expect(isHiddenFromStudents(new CanvasApiError(403, "403 Forbidden (Rate Limit Exceeded)"))).toBe(false);
    expect(isHiddenFromStudents(new CanvasApiError(503, "Service Unavailable"))).toBe(false);
    expect(isHiddenFromStudents(new Error("fetch failed"))).toBe(false);
  });
});

describe("sync problems", () => {
  it("names the course by its code", () => {
    expect(courseLabel(mism)).toBe("MISM2301");
    expect(courseLabel({ id: 1, name: "No code" })).toBe("1");
  });

  it("gives Canvas refusals as a status and other errors as their first line", () => {
    expect(syncProblem("inbox unavailable", new CanvasApiError(503, "<html>…</html>"))).toBe(
      "inbox unavailable (Canvas 503)"
    );
    expect(syncProblem("MISM2301 materials failed", new Error("fetch failed\n    at stack"))).toBe(
      "MISM2301 materials failed (fetch failed)"
    );
    expect(syncProblem("x", new Error("y".repeat(300))).length).toBeLessThan(130);
  });

  it("joins a few problems into the provider error and counts the rest", () => {
    expect(syncErrorText([])).toBeNull();
    expect(syncErrorText(["a (Canvas 500)", "b (Canvas 502)"])).toBe("a (Canvas 500); b (Canvas 502)");
    expect(syncErrorText(["a", "b", "c", "d", "e"])).toBe("a; b; c; and 2 more");
  });
});

describe("syncCanvasNews when Canvas refuses", () => {
  const courses = [
    { rowId: "mism-row", course: mism },
    { rowId: "schm-row", course: schm },
  ];

  it("reports failed announcement and inbox reads, keeps what's stored, and holds every course's baseline", async () => {
    const client = fakeClient({
      listAnnouncements: jest.fn().mockRejectedValue(new CanvasApiError(503, "Service Unavailable")),
      listConversations: jest.fn().mockRejectedValue(new Error("fetch failed")),
    });

    const result = await syncCanvasNews(client, courses, { now, selfId: 1 });

    expect(result.problems).toEqual([
      "announcements unavailable (Canvas 503)",
      "inbox unavailable (fetch failed)",
    ]);
    expect([...result.incomplete].sort()).toEqual(["mism-row", "schm-row"]);
    expect(db.courseAnnouncement.deleteMany).not.toHaveBeenCalled();
  });

  it("charges a thread that can't be read to its own course only", async () => {
    const client = fakeClient({
      listAnnouncements: jest.fn().mockResolvedValue([]),
      listConversations: jest.fn().mockResolvedValue([
        {
          id: 77,
          context_code: `course_${mism.id}`,
          subject: "Exam 1 room",
          last_message_at: "2026-10-23T09:00:00Z",
          message_count: 1,
          workflow_state: "unread",
        },
      ]),
      getConversation: jest.fn().mockRejectedValue(new CanvasApiError(500, "Internal Server Error")),
    });

    const result = await syncCanvasNews(client, courses, { now, selfId: 1 });

    expect(result.problems).toEqual(["inbox thread 77 unavailable (Canvas 500)"]);
    expect([...result.incomplete]).toEqual(["mism-row"]);
    expect(db.courseConversation.upsert).not.toHaveBeenCalled();
  });

  it("reports nothing when every read lands", async () => {
    const client = fakeClient({
      listAnnouncements: jest.fn().mockResolvedValue([]),
      listConversations: jest.fn().mockResolvedValue([]),
    });

    const result = await syncCanvasNews(client, courses, { now, selfId: 1 });

    expect(result.problems).toEqual([]);
    expect(result.incomplete.size).toBe(0);
  });
});

describe("syncCourseGradebook extras", () => {
  const assignment: CanvasAssignment = {
    id: 9001,
    name: "Exam 1",
    course_id: mism.id,
    due_at: "2026-10-23T12:00:00Z",
    points_possible: 100,
    submission_types: ["online_quiz"],
  };
  const options = { now, selfId: 1, timeZone: "America/New_York", courseGrade: null };
  const upserted = () => db.courseAssignment.upsert.mock.calls[0][0];

  it("leaves stored feedback alone and reports it when the submissions read fails", async () => {
    const client = fakeClient({
      listAssignmentGroups: jest.fn().mockResolvedValue([]),
      listAssignments: jest.fn().mockResolvedValue([assignment]),
      listSubmissions: jest.fn().mockRejectedValue(new CanvasApiError(500, "Internal Server Error")),
      listQuizzes: jest.fn().mockRejectedValue(new CanvasApiError(404, DISABLED)),
    });

    const result = await syncCourseGradebook(client, "mism-row", mism, options);

    // The quiz list is hidden in this course: not a problem, and read as empty.
    expect(result.problems).toEqual(["MISM2301 submissions unavailable (Canvas 500)"]);
    const { create, update } = upserted();
    expect(update).not.toHaveProperty("comments");
    expect(update).not.toHaveProperty("rubricAssessment");
    expect(update).toHaveProperty("quizTimeLimit", null);
    expect(create).toHaveProperty("comments");
  });

  it("leaves stored quiz rules alone and reports it when the quiz read fails", async () => {
    const client = fakeClient({
      listAssignmentGroups: jest.fn().mockResolvedValue([]),
      listAssignments: jest.fn().mockResolvedValue([assignment]),
      listSubmissions: jest.fn().mockResolvedValue([]),
      listQuizzes: jest.fn().mockRejectedValue(new CanvasApiError(503, "Service Unavailable")),
    });

    const result = await syncCourseGradebook(client, "mism-row", mism, options);

    expect(result.problems).toEqual(["MISM2301 quizzes unavailable (Canvas 503)"]);
    const { update } = upserted();
    expect(update).not.toHaveProperty("quizTimeLimit");
    expect(update).not.toHaveProperty("lockdownBrowser");
    expect(update).toHaveProperty("comments");
  });
});
