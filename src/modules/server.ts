/**
 * What each module adds to the server's side of the core (server only: these
 * import Prisma). The core reads this list and never imports a module's
 * server code itself.
 */
import type { RankSignals } from "@/lib/erwin/rank-stage1";
import type { Db, DbTransaction } from "@/lib/prisma";

import {
  courseClaimKeys,
  courseRankSignals,
  courseTaskFacts,
} from "@/modules/courses/facts";
import { syncCanvasIfDue } from "@/modules/courses/server";
import { goalRankSignals, goalTaskFacts } from "@/modules/ladder/facts";
import { linkChangedTasksToGoals } from "@/modules/ladder/server";
import { reconcileReachOuts } from "@/modules/people/reach-out";
import type { ModuleId } from "@/modules/types";

export interface ModuleJob {
  /** Names it in logs. */
  id: string;
  /** One person's pass. It runs every sync tick, so it must be cheap when there's nothing to do. */
  run: (userId: string) => Promise<unknown>;
}

/** A task the core is about to hand out, and what Focus made of it. */
export interface FactsRequest {
  id: string;
  /** Focus judged it DANGER, which earns the costlier facts (Courses: the grade if it's missed). */
  danger?: boolean;
}

/**
 * Fields a module adds to one task, spread onto it wherever the core hands
 * tasks out. The core never reads them; each module documents its own.
 */
export type TaskFacts = Record<string, unknown>;

export interface ServerContributions {
  /** Work the background sync loop runs for everyone who has the module on. */
  jobs?: ModuleJob[];
  /** Hears `tasksChanged` (src/modules/hooks.ts), on or off. */
  afterTasksChange?: (
    db: Db | DbTransaction,
    userId: string,
    taskIds?: string[]
  ) => Promise<void>;
  /** What it adds to tasks in the task list, the Focus queue and the briefing. Asked only while it's on. */
  taskFacts?: (
    db: Db,
    userId: string,
    tasks: FactsRequest[]
  ) => Promise<Map<string, TaskFacts>>;
  /**
   * What it tells Focus's ranking about tasks: a lift for work it doesn't own
   * (Ladder's goals), stakes for its own (Courses' points). Asked only while
   * it's on.
   */
  rankSignals?: (
    db: Db,
    userId: string,
    taskIds: string[]
  ) => Promise<Map<string, RankSignals>>;
  /** Keys a goal can claim tasks by beyond source and project ("course:<id>"), on or off. */
  claimKeys?: (
    db: Db | DbTransaction,
    userId: string,
    taskIds: string[]
  ) => Promise<Map<string, string[]>>;
}

export const SERVER_MODULES: Record<ModuleId, ServerContributions> = {
  courses: {
    jobs: [{ id: "courses.canvas-sync", run: syncCanvasIfDue }],
    taskFacts: courseTaskFacts,
    rankSignals: courseRankSignals,
    claimKeys: courseClaimKeys,
  },
  ladder: {
    afterTasksChange: linkChangedTasksToGoals,
    taskFacts: goalTaskFacts,
    rankSignals: goalRankSignals,
  },
  people: {
    jobs: [{ id: "people.reconcile", run: reconcileReachOuts }],
  },
};
