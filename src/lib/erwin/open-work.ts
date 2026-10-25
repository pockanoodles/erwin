/**
 * What counts as outstanding work, defined once so Focus, the attention list
 * and the course library never disagree.
 *
 * Canvas can finish a task without anyone ticking it: handed in, graded,
 * excused, or closed without a submission (`missed`). Those carry the state in
 * `submissionStatus` (see `lib/canvas/gradebook-plan.ts`) while `status` may
 * still read todo — a missed assignment is closed, not completed.
 */
import type { Prisma } from "@prisma/client";

import { CLOSED_STATES } from "@/lib/canvas/gradebook-plan";

import { visibleSourceWhere } from "@/modules/state";

const CLOSED_SUBMISSIONS = [...CLOSED_STATES];

/** Not done and not closed by Canvas. */
export function notClosedWhere(): Prisma.TaskWhereInput {
  return {
    status: { not: "completed" },
    OR: [{ submissionStatus: null }, { submissionStatus: { notIn: CLOSED_SUBMISSIONS } }],
  };
}

/**
 * Work someone can act on now: not closed, a top-level task, not deferred,
 * and — for Canvas — already unlocked. `hidden` is the task sources of the
 * modules this person has off (`hiddenTaskSources`): that work is still
 * stored, it just isn't theirs to act on while the module is off.
 */
export function openWorkWhere(
  userId: string,
  now: Date,
  hidden: readonly string[] = []
): Prisma.TaskWhereInput {
  return {
    userId,
    parentTaskId: null,
    AND: [
      notClosedWhere(),
      { OR: [{ postponedUntil: null }, { postponedUntil: { lte: now } }] },
      { OR: [{ unlockAt: null }, { unlockAt: { lte: now } }] },
      visibleSourceWhere(hidden),
    ],
  };
}
