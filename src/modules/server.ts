/**
 * What each module adds to the server's side of the core (server only: these
 * import Prisma). The core reads this list and never imports a module's
 * server code itself.
 */
import { syncCanvasIfDue } from "@/modules/courses/server";
import { reconcileReachOuts } from "@/modules/people/reach-out";
import type { ModuleId } from "@/modules/types";

export interface ModuleJob {
  /** Names it in logs. */
  id: string;
  /** One person's pass. It runs every sync tick, so it must be cheap when there's nothing to do. */
  run: (userId: string) => Promise<unknown>;
}

export interface ServerContributions {
  /** Work the background sync loop runs for everyone who has the module on. */
  jobs?: ModuleJob[];
}

export const SERVER_MODULES: Record<ModuleId, ServerContributions> = {
  courses: {
    jobs: [{ id: "courses.canvas-sync", run: syncCanvasIfDue }],
  },
  ladder: {},
  people: {
    jobs: [{ id: "people.reconcile", run: reconcileReachOuts }],
  },
};
