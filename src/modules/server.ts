/**
 * What each module adds to the server's side of the core (server only: these
 * import Prisma). The core reads this list and never imports a module's
 * server code itself.
 */
import type { RankSignals } from "@/lib/erwin/rank-stage1";
import type { Db, DbTransaction } from "@/lib/prisma";

import {
  courseClaimKeys,
  courseClaimOptions,
  courseRankSignals,
  courseTaskFacts,
} from "@/modules/courses/facts";
import { courseProofItems } from "@/modules/courses/proof";
import { syncCanvasIfDue } from "@/modules/courses/server";
import { goalRankSignals, goalTaskFacts } from "@/modules/ladder/facts";
import { linkChangedTasksToGoals } from "@/modules/ladder/server";
import { reconcileReachOuts } from "@/modules/people/reach-out";
import {
  routineClaimKeys,
  routineClaimOptions,
} from "@/modules/training/facts";
import { reconcileWorkouts } from "@/modules/training/workout";
import type { ClaimOption, ModuleId, ProofItem } from "@/modules/types";
import { restoreShiftEvents } from "@/modules/work/feed";
import { reconcileTimesheets } from "@/modules/work/timesheet";

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
  /** What it keeps that a boss can name as proof: these refs, or all. On or off. */
  proofItems?: (
    db: Db | DbTransaction,
    userId: string,
    refs?: string[]
  ) => Promise<ProofItem[]>;
  /** The claims it offers goals, for the goal form and to check a claim. On or off. */
  claimOptions?: (db: Db, userId: string) => Promise<ClaimOption[]>;
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
    claimOptions: courseClaimOptions,
    proofItems: courseProofItems,
  },
  ladder: {
    afterTasksChange: linkChangedTasksToGoals,
    taskFacts: goalTaskFacts,
    rankSignals: goalRankSignals,
  },
  people: {
    jobs: [{ id: "people.reconcile", run: reconcileReachOuts }],
  },
  training: {
    jobs: [{ id: "training.reconcile", run: reconcileWorkouts }],
    claimKeys: routineClaimKeys,
    claimOptions: routineClaimOptions,
  },
  // Nutrition keeps to its own page and the top bar: nothing on the server's side.
  nutrition: {},
  work: {
    jobs: [
      { id: "work.timesheets", run: reconcileTimesheets },
      { id: "work.calendar", run: restoreShiftEvents },
    ],
  },
};
