/**
 * Courses' gradebook items as Ladder's boss proofs (src/modules/server.ts
 * `proofItems`): handing the work in, a grade or being excused fells the
 * boss that names the item, and the item's due date wins over the boss's.
 */
import { formatScore } from "@/lib/canvas/activity-plan";
import { DONE_STATES } from "@/lib/canvas/gradebook-plan";
import type { Db, DbTransaction } from "@/lib/prisma";

import type { ProofItem } from "@/modules/types";

/** How a gradebook item reads as proof. */
export function readAsProof(item: {
  state: string;
  score: number | null;
  pointsPossible: number | null;
  grade: string | null;
}): Pick<ProofItem, "state" | "label" | "settles"> {
  const settles = DONE_STATES.has(item.state);
  switch (item.state) {
    case "graded": {
      const result = formatScore(item.score, item.pointsPossible, item.grade);
      return {
        state: "done",
        label: result ? `Graded ${result}` : "Graded",
        settles,
      };
    }
    case "excused":
      return { state: "done", label: "Excused", settles };
    case "submitted":
    case "pending_review":
      return { state: "done", label: "Handed in", settles };
    case "missed":
      return { state: "missed", label: "Missed", settles };
    case "missing":
      return { state: "open", label: "Missing in Canvas", settles };
    case "ended":
      // Nothing to hand in through Canvas, and the date has passed: an
      // in-class exam is settled when its grade is posted.
      return { state: "open", label: "Waiting on a grade", settles };
    default:
      return { state: "open", label: "Not handed in yet", settles };
  }
}

/** These gradebook items (Canvas ids), or every one of the person's. */
export async function courseProofItems(
  db: Db | DbTransaction,
  userId: string,
  refs?: string[]
): Promise<ProofItem[]> {
  const rows = await db.courseAssignment.findMany({
    where: { course: { userId }, ...(refs && { canvasId: { in: refs } }) },
    select: {
      canvasId: true,
      name: true,
      dueAt: true,
      state: true,
      score: true,
      pointsPossible: true,
      grade: true,
      courseId: true,
      course: { select: { code: true } },
      task: { select: { id: true, goalsPinned: true } },
    },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
  return rows.map((row) => ({
    ref: row.canvasId,
    name: row.name,
    groupId: row.courseId,
    courseCode: row.course.code,
    dueAt: row.dueAt,
    ...readAsProof(row),
    task: row.task,
  }));
}
