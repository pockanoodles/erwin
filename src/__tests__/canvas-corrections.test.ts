import {
  type Correction,
  activityBaseline,
  applyCorrections,
  correctionProblem,
  correctionUndone,
} from "@/lib/canvas/corrections";
import { assignmentActivity, planAssignment } from "@/lib/canvas/gradebook-plan";
import type { CanvasAssignment } from "@/lib/canvas/types";

const now = new Date("2026-10-27T16:00:00Z");
const ZONE = "America/New_York";

function plan(partial: Partial<CanvasAssignment> = {}) {
  return planAssignment(
    {
      id: 900,
      name: "Simulation - Quarter 3 Report - 1 per team turned in",
      course_id: 1,
      due_at: "2026-10-24T03:59:59Z",
      lock_at: "2026-10-24T05:00:00Z",
      points_possible: 50,
      submission_types: ["online_upload"],
      submission: null,
      ...partial,
    },
    undefined,
    null,
    now
  );
}

function correction(partial: Partial<Correction>): Correction {
  return {
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
    ...partial,
  };
}

const smartbook = (partial: Partial<CanvasAssignment> = {}) =>
  plan({
    id: 901,
    name: "Chapter 6. Managing Quality ",
    due_at: "2026-11-07T04:59:59Z", // Fri 11/6 11:59pm ET
    lock_at: null,
    submission_types: ["external_tool"],
    ...partial,
  });

const noonRule = correction({
  id: "rule",
  assignmentCanvasId: null,
  nameMatch: "^Chapter",
  submissionType: "external_tool",
  field: "dueAt",
  op: "setTime",
  value: "12:00",
  reason: "Connect closes SmartBook at noon",
  canvasValue: null,
});

describe("applyCorrections", () => {
  it("marks a team-submitted report handed in, keeping what Canvas said", () => {
    const raw = plan();
    expect(raw.state).toBe("missed");
    const { plan: next, applied, retired } = applyCorrections(raw, [correction({})], ZONE);
    expect(next.state).toBe("submitted");
    expect(applied).toEqual([
      { id: "c1", field: "state", canvas: "missed", value: "submitted", reason: "A teammate turned in the group copy" },
    ]);
    expect(retired).toEqual([]);
  });

  it("leaves other assignments alone", () => {
    const { plan: next, applied } = applyCorrections(plan({ id: 777 }), [correction({})], ZONE);
    expect(next.state).toBe("missed");
    expect(applied).toEqual([]);
  });

  it("keeps a state correction through the clock moving it (missing → missed)", () => {
    const c = correction({ canvasValue: "missing" });
    expect(applyCorrections(plan(), [c], ZONE).retired).toEqual([]);
  });

  it("retires a state correction once Canvas takes the work in", () => {
    const graded = plan({ submission: { id: 1, workflow_state: "graded", score: 46 } });
    const { plan: next, applied, retired } = applyCorrections(graded, [correction({})], ZONE);
    expect(next.state).toBe("graded");
    expect(applied).toEqual([]);
    expect(retired).toEqual([{ id: "c1", field: "state", note: "Canvas now says graded" }]);
  });

  it("moves a course rule's due time to noon on Canvas's own day", () => {
    const { plan: next, applied } = applyCorrections(smartbook(), [noonRule], ZONE);
    expect(next.dueAt?.toISOString()).toBe("2026-11-06T17:00:00.000Z"); // 12pm EST
    expect(applied[0]).toMatchObject({ field: "dueAt", canvas: "2026-11-07T04:59:59.000Z" });
  });

  it("matches a rule only on every filter it names", () => {
    const mhpo = smartbook({ name: "Module 4" });
    const upload = smartbook({ submission_types: ["online_upload"] });
    expect(applyCorrections(mhpo, [noonRule], ZONE).applied).toEqual([]);
    expect(applyCorrections(upload, [noonRule], ZONE).applied).toEqual([]);
  });

  it("never lets a rule retire, and records nothing once Canvas already agrees", () => {
    const fixed = smartbook({ due_at: "2026-11-06T17:00:00Z" });
    expect(applyCorrections(fixed, [noonRule], ZONE)).toMatchObject({ applied: [], retired: [] });
  });

  it("lets a one-assignment correction beat a course rule on the same field", () => {
    const own = correction({
      id: "own",
      assignmentCanvasId: "901",
      field: "dueAt",
      value: "2026-11-08T04:59:00Z",
      canvasValue: "2026-11-07T04:59:59.000Z",
      createdAt: new Date("2026-10-01T00:00:00Z"),
    });
    const { plan: next, applied } = applyCorrections(smartbook(), [own, noonRule], ZONE);
    expect(next.dueAt?.toISOString()).toBe("2026-11-08T04:59:00.000Z");
    expect(applied.map((a) => a.id)).toEqual(["own"]);
  });

  it("retires a date correction when the teacher moves the date", () => {
    const own = correction({
      assignmentCanvasId: "901",
      field: "dueAt",
      value: "2026-11-06T17:00:00Z",
      canvasValue: "2026-11-07T04:59:59.000Z",
    });
    const moved = smartbook({ due_at: "2026-11-10T04:59:59Z" });
    const { plan: next, retired } = applyCorrections(moved, [own], ZONE);
    expect(next.dueAt?.toISOString()).toBe("2026-11-10T04:59:59.000Z");
    expect(retired[0].note).toMatch(/^Canvas moved it: .* → /);
  });
});

describe("activityBaseline", () => {
  const ctx = { actionable: true, timeZone: ZONE, courseGrade: null };
  const row = (dueAt: string, state = "unsubmitted") => ({
    canvasId: "901", dueAt: new Date(dueAt), state, score: null, grade: null, comments: [],
  });
  const kinds = (
    prev: ReturnType<typeof row>,
    prevApplied: Parameters<typeof activityBaseline>[1],
    raw: ReturnType<typeof plan>,
    corrections: Correction[]
  ) => {
    const { plan: next } = applyCorrections(raw, corrections, ZONE);
    return assignmentActivity(activityBaseline(prev, prevApplied, raw, next), next, ctx, now).map((d) => d.kind);
  };

  it("doesn't announce a correction Kaito just made", () => {
    expect(kinds(row("2026-11-07T04:59:59Z"), [], smartbook(), [noonRule])).not.toContain("DUE_CHANGED");
  });

  it("doesn't announce a correction Kaito just deleted", () => {
    const applied = [{ id: "rule", field: "dueAt", canvas: "2026-11-07T04:59:59.000Z", value: "2026-11-06T17:00:00.000Z", reason: "" }];
    expect(kinds(row("2026-11-06T17:00:00Z"), applied, smartbook(), [])).not.toContain("DUE_CHANGED");
  });

  it("still announces Canvas moving a date a correction had changed", () => {
    const own = correction({
      assignmentCanvasId: "901",
      field: "dueAt",
      value: "2026-11-06T17:00:00Z",
      canvasValue: "2026-11-07T04:59:59.000Z",
    });
    const applied = [{ id: "c1", field: "dueAt", canvas: "2026-11-07T04:59:59.000Z", value: "2026-11-06T17:00:00.000Z", reason: "" }];
    const moved = smartbook({ due_at: "2026-11-10T04:59:59Z" });
    expect(kinds(row("2026-11-06T17:00:00Z"), applied, moved, [own])).toContain("DUE_CHANGED");
  });

  it("announces Canvas moving a date to where a rule would put it anyway", () => {
    // The noon rule corrected Friday; Canvas now says Monday noon, so the rule changes nothing.
    const applied = [{ id: "rule", field: "dueAt", canvas: "2026-11-07T04:59:59.000Z", value: "2026-11-06T17:00:00.000Z", reason: "" }];
    const monday = smartbook({ due_at: "2026-11-09T17:00:00Z" });
    expect(kinds(row("2026-11-06T17:00:00Z"), applied, monday, [noonRule])).toContain("DUE_CHANGED");
  });
});

describe("date corrections and state", () => {
  const stateFor = (raw: Partial<CanvasAssignment>) => (d: { dueAt: Date | null; lockAt: Date | null }) =>
    plan({ ...raw, due_at: d.dueAt?.toISOString() ?? null, lock_at: d.lockAt?.toISOString() ?? null }).state;

  it("reopens missed work when a correction moves its lock into the future", () => {
    const reopen = correction({
      field: "lockAt",
      value: "2026-10-30T03:59:00Z",
      canvasValue: "2026-10-24T05:00:00.000Z",
    });
    const { plan: next, applied } = applyCorrections(plan(), [reopen], ZONE, stateFor({}));
    expect(next.state).toBe("unsubmitted");
    expect(applied.find((a) => a.field === "state")).toMatchObject({ canvas: "missed", value: "unsubmitted" });
  });

  it("lets a state correction have the last word over a moved date", () => {
    const reopen = correction({ id: "lock", field: "lockAt", value: "2026-10-30T03:59:00Z", canvasValue: "2026-10-24T05:00:00.000Z" });
    const { plan: next } = applyCorrections(plan(), [reopen, correction({})], ZONE, stateFor({}));
    expect(next.state).toBe("submitted");
  });
});

describe("state corrections against done work", () => {
  it("keeps a correction made on graded work until Canvas changes its answer", () => {
    const graded = plan({ submission: { id: 1, workflow_state: "graded", score: 46 } });
    const excuse = correction({ value: "excused", canvasValue: "graded" });
    expect(applyCorrections(graded, [excuse], ZONE)).toMatchObject({ retired: [], plan: { state: "excused" } });
  });

  it("retires it when Canvas reopens the work", () => {
    const excuse = correction({ value: "excused", canvasValue: "graded" });
    expect(applyCorrections(plan(), [excuse], ZONE).retired).toEqual([
      { id: "c1", field: "state", note: "Canvas now says missed" },
    ]);
  });
});

describe("correctionUndone", () => {
  const handedIn = [{ id: "c1", field: "state", canvas: "missed", value: "submitted", reason: "" }];

  it("reopens work only a deleted correction had handed in", () => {
    expect(correctionUndone(handedIn, plan())).toBe(true);
  });

  it("leaves it done while a correction or Canvas still says so", () => {
    expect(correctionUndone(handedIn, applyCorrections(plan(), [correction({})], ZONE).plan)).toBe(false);
    expect(correctionUndone(handedIn, plan({ submission: { id: 1, workflow_state: "graded" } }))).toBe(false);
    expect(correctionUndone([], plan())).toBe(false);
  });
});

describe("correctionProblem", () => {
  it("accepts the two shapes in use", () => {
    expect(correctionProblem({ field: "state", op: "set", value: "submitted", assignmentCanvasId: "900" })).toBeNull();
    expect(correctionProblem({ field: "dueAt", op: "setTime", value: "12:00", submissionType: "external_tool" })).toBeNull();
  });

  it("refuses what would be a silent no-op or a blanket rewrite", () => {
    expect(correctionProblem({ field: "score", op: "set", value: "50", assignmentCanvasId: "900" })).toMatch(/field/);
    expect(correctionProblem({ field: "state", op: "set", value: "done", assignmentCanvasId: "900" })).toMatch(/state/);
    expect(correctionProblem({ field: "state", op: "setTime", value: "12:00", assignmentCanvasId: "900" })).toMatch(/op set/);
    expect(correctionProblem({ field: "dueAt", op: "setTime", value: "noon", assignmentCanvasId: "900" })).toMatch(/HH:mm/);
    expect(correctionProblem({ field: "dueAt", op: "setTime", value: "12:00" })).toMatch(/needs nameMatch/);
    expect(correctionProblem({ field: "dueAt", op: "setTime", value: "12:00", nameMatch: "(" })).toMatch(/regex/);
  });
});
