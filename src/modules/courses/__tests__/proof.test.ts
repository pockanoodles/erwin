import { readAsProof } from "@/modules/courses/proof";

describe("readAsProof", () => {
  const item = (state: string, score: number | null = null) => ({
    state,
    score,
    pointsPossible: 100,
    grade: null,
  });

  it("fells a boss on a hand-in, a grade or an excusal, and says which", () => {
    expect(readAsProof(item("graded", 90))).toEqual({
      state: "done",
      label: "Graded 90 / 100",
      settles: true,
    });
    expect(readAsProof(item("pending_review"))).toMatchObject({
      state: "done",
      label: "Handed in",
      settles: true,
    });
    expect(readAsProof(item("excused"))).toMatchObject({
      state: "done",
      label: "Excused",
      settles: true,
    });
  });

  it("keeps it open until then, and calls a closed item missed", () => {
    expect(readAsProof(item("unsubmitted"))).toMatchObject({
      state: "open",
      label: "Not handed in yet",
      settles: false,
    });
    expect(readAsProof(item("ended"))).toMatchObject({
      state: "open",
      label: "Waiting on a grade",
      settles: false,
    });
    expect(readAsProof(item("missed"))).toMatchObject({
      state: "missed",
      label: "Missed",
      settles: false,
    });
  });
});
