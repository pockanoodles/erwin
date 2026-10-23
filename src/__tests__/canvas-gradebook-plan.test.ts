import {
  type ActivityDraft,
  bodyText,
  draftsToWrite,
  excerpt,
  formatScore,
} from "@/lib/canvas/activity-plan";
import {
  type PlannedAssignment,
  type StoredAssignment,
  assignmentActivity,
  isActionable,
  mergeSubmission,
  planAssignment,
  submissionState,
} from "@/lib/canvas/gradebook-plan";
import type { CanvasAssignment, CanvasSubmission } from "@/lib/canvas/types";

const now = new Date("2026-10-22T16:00:00Z");
const SELF = 349827;

function assignment(partial: Partial<CanvasAssignment> = {}): CanvasAssignment {
  return {
    id: 3310774,
    name: "Assignment 4 (UNOCAL)",
    course_id: 264719,
    due_at: "2026-10-02T11:00:00Z",
    points_possible: 2,
    submission_types: ["online_upload"],
    ...partial,
  };
}

function sub(partial: Partial<CanvasSubmission>): CanvasSubmission {
  return { id: 1, ...partial };
}

describe("submissionState", () => {
  it("ignores classmates: a course-wide flag never completes this student's work", () => {
    const a = assignment({ due_at: "2026-10-30T11:00:00Z", submission: null });
    (a as unknown as { has_submitted_submissions: boolean }).has_submitted_submissions = true;
    expect(submissionState(a, now)).toBe("unsubmitted");
  });

  it("reads graded, pending review, submitted and excused", () => {
    expect(submissionState(assignment({ submission: sub({ workflow_state: "graded", score: 2 }) }), now)).toBe("graded");
    expect(submissionState(assignment({ submission: sub({ workflow_state: "pending_review" }) }), now)).toBe("pending_review");
    expect(submissionState(assignment({ submission: sub({ workflow_state: "submitted" }) }), now)).toBe("submitted");
    expect(
      submissionState(assignment({ submission: sub({ workflow_state: "unsubmitted", submitted_at: "2026-10-01T10:00:00Z" }) }), now)
    ).toBe("submitted");
    expect(submissionState(assignment({ submission: sub({ workflow_state: "graded", excused: true }) }), now)).toBe("excused");
  });

  it("tells late-but-open work from work Canvas has closed", () => {
    const missing = sub({ workflow_state: "unsubmitted", missing: true });
    expect(submissionState(assignment({ lock_at: null, submission: missing }), now)).toBe("missing");
    expect(submissionState(assignment({ lock_at: "2026-11-01T00:00:00Z", submission: missing }), now)).toBe("missing");
    // INTB A1: late work isn't accepted, so the lock is the due date.
    expect(submissionState(assignment({ lock_at: "2026-09-15T11:00:00Z", submission: missing }), now)).toBe("missed");
  });

  it("ends work Canvas never sees once its date passes: simulation rounds, in-class quizzes", () => {
    const sim = assignment({ name: "Simulation 2", submission_types: ["not_graded"], points_possible: null, due_at: "2026-10-05T03:59:00Z", submission: sub({ workflow_state: "unsubmitted" }) });
    expect(submissionState(sim, now)).toBe("ended");
    expect(submissionState({ ...sim, due_at: "2026-10-26T03:59:00Z" }, now)).toBe("unsubmitted");
    // Graded in class beats ended.
    expect(submissionState({ ...sim, submission_types: ["on_paper"], submission: sub({ workflow_state: "graded", score: 9 }) }, now)).toBe("graded");
  });

  it("calls locked submittable work Canvas never flagged missed, and past in-class work ended", () => {
    const unsubmitted = sub({ workflow_state: "unsubmitted" });
    expect(submissionState(assignment({ lock_at: "2026-10-02T12:00:00Z", submission: unsubmitted }), now)).toBe("missed");
    expect(
      submissionState(
        assignment({ lock_at: "2026-10-02T12:00:00Z", submission_types: ["on_paper"], submission: unsubmitted }),
        now
      )
    ).toBe("ended");
  });
});

describe("isActionable", () => {
  it("keeps dated work whatever its type, points or submission state", () => {
    expect(isActionable(assignment())).toBe(true);
    // MKTG simulation rounds: not graded in Canvas, but a real deadline.
    expect(isActionable(assignment({ submission_types: ["not_graded"], points_possible: null, due_at: "2026-10-26T03:59:00Z" }))).toBe(true);
    // SCHM peer evaluations: zero points, still required.
    expect(isActionable(assignment({ points_possible: 0, due_at: "2026-12-04T05:00:00Z" }))).toBe(true);
    expect(isActionable(assignment({ submission: sub({ workflow_state: "graded", score: 2 }) }))).toBe(true);
  });

  it("keeps undated work there is something to hand in for", () => {
    expect(isActionable(assignment({ name: "Case Presentations", due_at: null, points_possible: 100, submission_types: ["media_recording", "online_upload"] }))).toBe(true);
  });

  it("leaves participation lines, grade adjustments and posted final grades to the gradebook", () => {
    expect(isActionable(assignment({ name: "Attendance & Participation", due_at: null, points_possible: 100, submission_types: ["none"] }))).toBe(false);
    expect(isActionable(assignment({ name: "Point Adjustment -Simulation", due_at: null, points_possible: 0, submission_types: ["online_text_entry"] }))).toBe(false);
    expect(isActionable(assignment({ name: "Final Course Grade (letter)", due_at: null, points_possible: 0, omit_from_final_grade: true, submission_types: ["online_text_entry"] }))).toBe(false);
  });
});

describe("mergeSubmission", () => {
  it("overlays the submissions endpoint's comments and marks on the embedded submission", () => {
    const merged = mergeSubmission(
      sub({ workflow_state: "graded", score: 18 }),
      sub({ workflow_state: "graded", score: 18, submission_comments: [{ id: 9, comment: "Nice" }] })
    );
    expect(merged?.score).toBe(18);
    expect(merged?.submission_comments).toHaveLength(1);
    expect(mergeSubmission(null, undefined)).toBeNull();
  });
});

describe("planAssignment", () => {
  it("flags LockDown Browser from the quiz or, when the quiz list is hidden, the title", () => {
    const exam = assignment({ name: "Exam 1- Requires Respondus LockDown Browser", submission_types: ["online_quiz"] });
    expect(planAssignment(exam, undefined, SELF, now).lockdownBrowser).toBe(true);
    const timed = planAssignment(
      assignment({ name: "Test 2", submission_types: ["online_quiz"] }),
      { id: 1, title: "Test 2", assignment_id: 3310774, time_limit: 60, allowed_attempts: 1, require_lockdown_browser: true, question_count: 50 },
      SELF,
      now
    );
    expect(timed).toMatchObject({ quizTimeLimit: 60, quizAllowedAttempts: 1, quizQuestionCount: 50, lockdownBrowser: true });
  });

  it("marks this student's own comments and keeps them oldest first", () => {
    const plan = planAssignment(
      assignment({
        submission: sub({
          submission_comments: [
            { id: 2, author_id: 77, author_name: "Paul Fombelle", comment: "Good use of STP.", created_at: "2026-10-20T12:00:00Z" },
            { id: 1, author_id: SELF, author_name: "Kaito Soeno", comment: "Resubmitted.", created_at: "2026-10-19T12:00:00Z" },
            { id: 3, author_id: 77, comment: "   ", created_at: "2026-10-21T12:00:00Z" },
          ],
        }),
      }),
      undefined,
      SELF,
      now
    );
    expect(plan.comments.map((c) => [c.id, c.mine])).toEqual([
      ["1", true],
      ["2", false],
    ]);
  });
});

describe("assignmentActivity", () => {
  const ctx = { actionable: true, timeZone: "America/New_York", courseGrade: null };

  function planned(partial: Partial<PlannedAssignment>): PlannedAssignment {
    return { ...planAssignment(assignment(), undefined, SELF, now), ...partial };
  }
  function stored(partial: Partial<StoredAssignment> = {}): StoredAssignment {
    return { canvasId: "3310774", dueAt: new Date("2026-10-02T11:00:00Z"), state: "unsubmitted", score: null, grade: null, comments: [], ...partial };
  }
  const kinds = (drafts: ActivityDraft[]) => drafts.map((d) => d.kind);

  it("announces a new assignment with its due date, unless it's already done or not a task", () => {
    const fresh = assignmentActivity(undefined, planned({ state: "unsubmitted" }), ctx, now);
    expect(kinds(fresh)).toEqual(["ASSIGNMENT_NEW"]);
    expect(fresh[0].detail).toBe("Due Fri Oct 2, 7:00 AM");
    expect(assignmentActivity(undefined, planned({ state: "submitted" }), ctx, now)).toEqual([]);
    expect(assignmentActivity(undefined, planned({}), { ...ctx, actionable: false }, now)).toEqual([]);
  });

  it("reports a moved due date as before → after, in the course's time zone", () => {
    const drafts = assignmentActivity(stored(), planned({ dueAt: new Date("2026-10-05T03:59:00Z") }), ctx, now);
    expect(drafts).toMatchObject([{ kind: "DUE_CHANGED", detail: "Fri Oct 2, 7:00 AM → Sun Oct 4, 11:59 PM" }]);
  });

  it("posts a grade once, with the course total, and reports a regrade as a change", () => {
    const graded = planned({ state: "graded", score: 18, pointsPossible: 18, gradedAt: new Date("2026-10-01T20:46:16Z") });
    const posted = assignmentActivity(stored({ state: "submitted" }), graded, { ...ctx, courseGrade: "99.6% A" }, now);
    expect(posted).toMatchObject([{ kind: "GRADE_POSTED", detail: "18 / 18 · course 99.6% A" }]);
    expect(assignmentActivity(stored({ state: "graded", score: 18 }), graded, ctx, now)).toEqual([]);
    const regraded = assignmentActivity(stored({ state: "graded", score: 16 }), graded, ctx, now);
    expect(regraded).toMatchObject([{ kind: "GRADE_CHANGED", detail: "16 / 18 → 18 / 18" }]);
  });

  it("waits for a grade to be posted before announcing it", () => {
    expect(assignmentActivity(stored({ state: "submitted" }), planned({ state: "graded", score: null, grade: null }), ctx, now)).toEqual([]);
  });

  it("turns each new comment from someone else into feedback", () => {
    const comments = [
      { id: "1", author: "Kaito Soeno", body: "Resubmitted.", createdAt: "2026-10-19T12:00:00Z", mine: true },
      { id: "2", author: "Paul Fombelle", body: "Good use of STP.", createdAt: "2026-10-20T12:00:00Z", mine: false },
      { id: "3", author: "Paul Fombelle", body: "See rubric row 2.", createdAt: "2026-10-21T12:00:00Z", mine: false },
    ];
    const drafts = assignmentActivity(stored({ comments: comments.slice(0, 2) }), planned({ comments }), ctx, now);
    expect(drafts).toMatchObject([{ kind: "FEEDBACK", detail: "Paul Fombelle: See rubric row 2.", dedupeKey: "comment:3" }]);
  });

  it("says when work goes missing, and again when Canvas closes it", () => {
    expect(assignmentActivity(stored(), planned({ state: "missing" }), ctx, now)).toMatchObject([
      { kind: "MISSING", detail: "Past due — Canvas still takes it" },
    ]);
    expect(assignmentActivity(stored({ state: "missing" }), planned({ state: "missed" }), ctx, now)).toMatchObject([
      { kind: "MISSING", detail: "Closed without a submission" },
    ]);
    expect(assignmentActivity(stored({ state: "missed" }), planned({ state: "missed" }), ctx, now)).toEqual([]);
  });
});

describe("draftsToWrite", () => {
  const draft = (kind: ActivityDraft["kind"], daysAgo: number, readInCanvas?: boolean): ActivityDraft => ({
    kind,
    title: kind,
    detail: null,
    dedupeKey: `${kind}:${daysAgo}`,
    occurredAt: new Date(now.getTime() - daysAgo * 86_400_000),
    readInCanvas,
  });

  it("keeps a first sync to recent history, seen unless Canvas says unread", () => {
    const written = draftsToWrite(
      [
        draft("ANNOUNCEMENT", 2, false),
        draft("ANNOUNCEMENT", 3, true),
        draft("GRADE_POSTED", 5),
        draft("GRADE_POSTED", 30),
        draft("ASSIGNMENT_NEW", 0),
        draft("MATERIAL_NEW", 0),
      ],
      { baseline: true, now }
    );
    expect(written.map((d) => [d.dedupeKey, d.seen])).toEqual([
      ["ANNOUNCEMENT:2", false],
      ["ANNOUNCEMENT:3", true],
      ["GRADE_POSTED:5", true],
    ]);
  });

  it("writes everything after that, unseen unless it was already read in Canvas", () => {
    const written = draftsToWrite([draft("MATERIAL_NEW", 0), draft("ANNOUNCEMENT", 0, true)], { baseline: false, now });
    expect(written.map((d) => d.seen)).toEqual([false, true]);
  });
});

describe("activity text", () => {
  it("formats scores and grades", () => {
    expect(formatScore(18, 18, "18")).toBe("18 / 18");
    expect(formatScore(8.5, 10, null)).toBe("8.5 / 10");
    expect(formatScore(null, null, "complete")).toBe("complete");
    expect(formatScore(null, 10, null)).toBeNull();
  });

  it("compares bodies by their visible text and cuts excerpts at a word", () => {
    expect(bodyText("<p>Exam&nbsp;is <b>open</b> notes</p>")).toBe(bodyText("<div>Exam is open   notes</div>"));
    expect(bodyText("<p>canvas -&gt; Assignments &amp; Q&#39;s &#x2014; done</p>")).toBe("canvas -> Assignments & Q's — done");
    expect(excerpt("one two three four five six", 20)).toBe("one two three four…");
  });
});
