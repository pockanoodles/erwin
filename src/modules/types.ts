/**
 * A module is an optional part of Erwin that each person turns on or off on
 * /modules. The core (Today, Focus, Calendar, Tasks) works without any of
 * them; a module adds to the core through fixed slots, and the core never
 * reaches into a module.
 *
 * Each module is split in three so the browser bundle never pulls in server
 * code: `manifest.ts` is plain data and safe anywhere, its components are
 * listed in `src/modules/client.tsx`, and its jobs and ranking hooks in
 * `src/modules/server.ts`.
 */

export type ModuleId = "courses" | "ladder" | "people";

/** One thing a module sends out of Erwin, written for someone who isn't an engineer. */
export interface ModuleEgress {
  /** Who receives it: "Your school's Canvas". */
  to: string;
  /** What goes there. */
  sends: string;
  /** What it's for. */
  why: string;
}

export interface ModuleManifest {
  id: ModuleId;
  name: string;
  /** One sentence for the catalog. */
  summary: string;
  /** Whether it's on for someone who has never turned it on or off. */
  defaultOn: boolean;
  /** Its one entry in the rail. Other views of it live in the top bar. */
  page?: { href: string; keywords: string[] };
  /** The `Task.source` values it owns. When it's off, those tasks leave every list. */
  sources: string[];
  /** What a task's link says, per source it owns ("Open in Canvas"). */
  linkLabels?: Record<string, string>;
  /** What it adds to the core, one short line each. */
  adds: string[];
  /** What it stores, plainly. */
  keeps: string;
  /** Everything it sends out of Erwin. Empty means nothing leaves. */
  egress: ModuleEgress[];
}

/** A module as one person has it. */
export interface ModuleState {
  id: ModuleId;
  on: boolean;
  /** Order in the rail, lowest first. */
  position: number;
}

/** What GET /api/modules returns per module. */
export type ModuleListing = ModuleManifest & Omit<ModuleState, "id">;
