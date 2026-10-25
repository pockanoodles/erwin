import { itemProof, selfProof, suggestProof, taskProof, type ProofCandidate } from "../erwin/boss-proof";

describe("proofs", () => {
  it("reads a module's item as it stands, or says it isn't there yet", () => {
    const item = {
      ref: "1",
      name: "Test 2",
      groupId: "c",
      courseCode: null,
      dueAt: null,
      state: "done" as const,
      label: "Graded 90 / 100",
      settles: true,
      task: null,
    };
    expect(itemProof(item)).toEqual({ source: "canvas", state: "done", label: "Graded 90 / 100" });
    expect(itemProof(undefined)).toEqual({ source: "canvas", state: "open", label: "Not in your gradebook yet" });
  });

  it("reads tasks and hand-marked bosses too", () => {
    expect(taskProof({ status: "completed" })).toMatchObject({ source: "task", state: "done" });
    expect(selfProof("active")).toEqual({ source: null, state: "open", label: "You mark it" });
  });
});

// Kaito's fall 2026 gradebook and the bosses his vault names, 2026-10-24.
const item = (canvasId: string, course: string, name: string, dueDay: string | null): ProofCandidate => ({
  canvasId,
  name,
  courseCode: `${course}.10244.202710`,
  dueDay,
});
const gradebook = [
  item("3514407", "SCHM2301", "Test #1 Ch 2, 3 & 5 -  Requires Respondus LockDown Browser", null),
  item("3498873", "SCHM2301", "Test #2 Ch 10, 7 & 12 - Requires Respondus LockDown Browser", null),
  item("3498871", "SCHM2301", "Test #3 Ch 9, 6, 11 & 14 - Requires Respondus LockDown Browser", null),
  item("3500294", "SCHM2301", "Module 6", "2026-12-02"),
  item("3498903", "SCHM2301", "TEAM CASE PRESENTATION (upload ppt)", "2026-12-08"),
  item("3498877", "SCHM2301", "Case Presentations", null),
  item("3498876", "SCHM2301", "CASE Peer Eval UPLOAD", "2026-12-08"),
  item("3402758", "MKTG2201", "Introduction to Marketing Test 1 - Requires Respondus LockDown Browser + Webcam", "2026-10-16"),
  item("3402766", "MKTG2201", "Introduction to Marketing - Test 2 - Requires Respondus LockDown Browser + Webcam", "2026-11-13"),
  item("3402765", "MKTG2201", "Introduction to Marketing - Test 3 - Requires Respondus LockDown Browser + Webcam", "2026-12-15"),
  item("3402830", "MKTG2201", "Module 6 Homework Assignment", "2026-10-16"),
  item("3310767", "INTB1203", "Exam 1- Requires Respondus LockDown Browser", "2026-10-09"),
  item("3310786", "INTB1203", "Foreign Market Entry Project", "2026-12-03"),
  item("3310785", "INTB1203", "Group Project - Submit Firm Presentation Slides Here", "2026-12-03"),
  item("3310782", "INTB1203", "Final Course Grade (number)", null),
  item("3531071", "MISM2301", "Midterm Exam - Requires Respondus LockDown Browser + Screen Recording", null),
  item("3453108", "MISM2301", "Five Forces Case Study ", "2026-09-26"),
];
const suggest = (title: string, day: string | null, taken: string[] = []) =>
  suggestProof(
    { title, day },
    gradebook.filter((g) => !taken.includes(g.canvasId))
  )?.canvasId ?? null;

describe("suggestProof", () => {
  it("finds the exam a boss is, by course, kind, number and date", () => {
    expect(suggest("SCHM2301 Test 1", "2026-10-06")).toBe("3514407");
    expect(suggest("SCHM2301 Test 2", "2026-11-03")).toBe("3498873");
    expect(suggest("SCHM2301 Test 3", "2026-11-20")).toBe("3498871");
    expect(suggest("INTB1203 Exam 1", "2026-10-09")).toBe("3310767");
    expect(suggest("MISM2301 Exam 1", "2026-10-23")).toBe("3531071");
  });

  it("matches a course whose number differs in Canvas, on the same subject", () => {
    expect(suggest("MKTG2209 Exam 1", "2026-10-15")).toBe("3402758");
    expect(suggest("MKTG2209 Exam 2 — unresolved (", "2026-11-12")).toBe("3402766");
    expect(suggest("MKTG2209 Exam 3", "2026-12-14")).toBe("3402765");
  });

  it("suggests nothing for an exam Canvas hasn't published, or one taken by another boss", () => {
    expect(suggest("INTB1203 Exam 2", "2026-11-03")).toBeNull();
    expect(suggest("MISM2301 Exam 2", "2026-12-04", ["3531071"])).toBeNull();
    expect(suggest("MISM2301 final project presentations", "2026-12-08")).toBeNull();
  });

  it("won't pick between two items that fit equally", () => {
    expect(suggest("SCHM2301 Team 3 case presentation (American Vinyl)", "2026-10-02")).toBeNull();
  });

  it("leaves goals that aren't coursework alone", () => {
    expect(suggest("BCF 2026 executed", "2026-11-22")).toBeNull();
    expect(suggest("CFA Level 1 exam", "2027-05-11")).toBeNull();
    expect(suggest("2028 offer accepted", "2027-11-30")).toBeNull();
  });
});
