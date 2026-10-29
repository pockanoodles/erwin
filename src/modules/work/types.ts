/**
 * What the Work module's API sends the browser and takes from it. Plain
 * types, safe in either bundle.
 *
 * Days are "yyyy-MM-dd" in the person's own time zone; moments are ISO
 * instants. Hours are decimal (7.5 is seven and a half).
 */

export interface JobLink {
  label: string;
  url: string;
}

/** A pay period's hours, as they stand now. */
export interface PeriodRow {
  jobId: string;
  /** Its first and last day. */
  first: string;
  last: string;
  /** When its hours are due on the timesheet. */
  dueBy: string;
  /** Hours of shifts that have ended (as worked, where that was changed). */
  hours: number;
  /** Hours of every shift in it that wasn't dropped, worked or still to come. */
  scheduledHours: number;
  /** `hours` at the job's rate, before tax. Null without a rate. */
  earnings: number | null;
  /** Shifts worked in it. */
  shifts: number;
  /** Worked shifts whose hours aren't on a timesheet yet. */
  unlogged: number;
  /** Every worked shift in it is on a timesheet. */
  submitted: boolean;
  /**
   * It starts on or after the job's `timesheetsFrom`. One before was handled
   * before Sigwald tracked it: it reads as submitted and can't be reopened.
   */
  tracked: boolean;
  /** Today falls in it. */
  current: boolean;
  /** Its open "Submit hours" task, if it has one. */
  taskId: string | null;
}

export interface JobRow {
  id: string;
  name: string;
  /** #RRGGBBAA, as calendar feeds keep it. */
  color: string;
  hourlyRate: number | null;
  currency: string;
  /** 7 or 14; null means no timesheets. */
  payPeriodDays: number | null;
  payPeriodStart: string | null;
  timesheetDueDays: number;
  timesheetsFrom: string | null;
  weeklyCapHours: number | null;
  links: JobLink[];
  notes: string | null;
  /** The slug a schedule import names it by; null when every shift is added by hand. */
  importKey: string | null;
  archived: boolean;
  createdAt: string;
  /** This week (the person's week start), counting every shift not dropped. */
  week: { first: string; last: string; hours: number; workedHours: number };
  /** The pay period today falls in; null without a pay period. */
  period: PeriodRow | null;
  /** The shift on now, or the next one. */
  nextShift: ShiftRow | null;
  /** Every shift it has, dropped ones included. */
  shiftCount: number;
}

export interface ContactRow {
  id: string;
  jobId: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  /** From a roster import, which replaces it; one added by hand stays. */
  imported: boolean;
}

export interface ShiftRow {
  id: string;
  jobId: string;
  title: string;
  /** As scheduled. */
  start: string;
  end: string;
  /** As worked, where that differs. */
  workedStart: string | null;
  workedEnd: string | null;
  /** The day it starts on, locally. */
  day: string;
  location: string | null;
  role: string | null;
  supervisor: string | null;
  /** What the schedule said about it, as it said it. */
  details: string | null;
  dropped: boolean;
  note: string | null;
  /** When its hours went on a timesheet. */
  loggedAt: string | null;
  /** Added by hand; an imported one comes from the schedule and only an import changes its times. */
  byHand: boolean;
  /** Its length as worked (or as scheduled, before it's over). */
  hours: number;
  /** It has ended and wasn't dropped. */
  worked: boolean;
  /** The job's contact whose name matches its supervisor. */
  contact: ContactRow | null;
}

/** The shift on now or next, for the top bar (GET /api/sigwald/work/next). */
export interface NextShift extends ShiftRow {
  jobName: string;
  color: string;
}

/** What a "Submit hours" task is about (GET /api/sigwald/work/tasks/:id). */
export interface TimesheetDetail {
  job: JobRow;
  period: PeriodRow;
  shifts: ShiftRow[];
}

export interface JobInput {
  name?: string;
  color?: string;
  hourlyRate?: number | null;
  currency?: string;
  payPeriodDays?: 7 | 14 | null;
  payPeriodStart?: string | null;
  timesheetDueDays?: number;
  timesheetsFrom?: string | null;
  weeklyCapHours?: number | null;
  links?: JobLink[];
  notes?: string | null;
  archived?: boolean;
}

/** A shift added by hand. */
export interface ShiftInput {
  title: string;
  start: string;
  end: string;
  location?: string | null;
  role?: string | null;
  supervisor?: string | null;
  note?: string | null;
}

/**
 * A change to a shift. Times, title, place, role and supervisor change only
 * on one added by hand; any shift takes the rest.
 */
export interface ShiftPatch extends Partial<ShiftInput> {
  dropped?: boolean;
  workedStart?: string | null;
  workedEnd?: string | null;
}

export interface ContactInput {
  name?: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}
