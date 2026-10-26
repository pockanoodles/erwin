import type { Entry, PlannedExercise, Unit } from "@/modules/training/sets";

/** A routine as the Training API sends it: dates as ISO strings. */
export interface RoutineRow {
  id: string;
  name: string;
  notes: string | null;
  /** Days between sessions (7/3 for three a week); null with no schedule. */
  cadenceDays: number | null;
  minutes: number;
  plan: PlannedExercise[];
  lastDoneAt: string | null;
  archived: boolean;
  createdAt: string;
  /** The day the next session is due ("2026-10-27"); null with no schedule. */
  nextDue: string | null;
  /** How many sessions are logged. */
  sessions: number;
}

/** A session as the Training API sends it. */
export interface WorkoutRow {
  id: string;
  routineId: string;
  routineName: string;
  at: string;
  unit: Unit;
  note: string | null;
  /** Its task was ticked off elsewhere and nothing is entered yet. */
  ticked: boolean;
  entries: Entry[];
}

/** The fields the page can edit on a routine. */
export type RoutineInput = Partial<
  Pick<
    RoutineRow,
    "name" | "notes" | "cadenceDays" | "minutes" | "plan" | "archived"
  >
>;

/** A session as the page sends it. */
export interface WorkoutInput {
  at?: string;
  unit: Unit;
  note: string | null;
  entries: Entry[];
}
