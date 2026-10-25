/** A person as the People API sends them: dates as ISO strings. */
export interface PersonRow {
  id: string;
  name: string;
  org: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  link: string | null;
  notes: string | null;
  cadenceDays: number | null;
  lastContactAt: string | null;
  archived: boolean;
  createdAt: string;
  /** When they're next due a check-in; null with no cadence. */
  nextCheckIn: string | null;
}

export interface InteractionRow {
  id: string;
  at: string;
  /** "message", "call", "meeting", "email", or "done" (the task was ticked). */
  kind: string;
  note: string | null;
}

/** The fields the page can edit. */
export type PersonInput = Partial<
  Pick<
    PersonRow,
    | "name"
    | "org"
    | "role"
    | "email"
    | "phone"
    | "link"
    | "notes"
    | "cadenceDays"
    | "archived"
  >
>;
