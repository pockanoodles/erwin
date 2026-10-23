/**
 * Pure shapes and rules for course activity: the feed of what changed in
 * Canvas since the last sync. Each sync step (gradebook, materials,
 * announcements and inbox) diffs what it stored against what Canvas returns
 * and emits drafts; `activity.ts` writes them. No IO here.
 */

export type ActivityKind =
  | "ANNOUNCEMENT"
  | "MESSAGE"
  | "MATERIAL_NEW"
  | "MATERIAL_UPDATED"
  | "SYLLABUS_CHANGED"
  | "ASSIGNMENT_NEW"
  | "DUE_CHANGED"
  | "GRADE_POSTED"
  | "GRADE_CHANGED"
  | "FEEDBACK"
  | "MISSING";

export interface ActivityDraft {
  kind: ActivityKind;
  title: string;
  detail: string | null;
  /** Unique per course; the same event seen twice is written once. */
  dedupeKey: string;
  occurredAt: Date;
  /** What it points at, by Canvas identity. The writer resolves these to row ids. */
  target?: {
    assignment?: string;
    materialRef?: string;
    announcement?: string;
    conversation?: string;
  };
  /**
   * Canvas's own read flag, for announcements and inbox messages. Read there
   * means seen here. At a course's first sync, recent history arrives seen
   * unless this is explicitly false.
   */
  readInCanvas?: boolean;
}

/** How far back a course's first sync still records history. */
export const BASELINE_HISTORY_MS = 14 * 86_400_000;

/** History worth having on day one. Everything else that existed is the starting state, not news. */
const HISTORY_KINDS: ReadonlySet<ActivityKind> = new Set([
  "ANNOUNCEMENT",
  "MESSAGE",
  "GRADE_POSTED",
  "FEEDBACK",
]);

/**
 * Which drafts to write and whether each arrives seen. At a course's first
 * sync what existed is the baseline: only recent history is kept, seen unless
 * Canvas says it's unread. After that everything is news, unseen unless it
 * was already read in Canvas.
 */
export function draftsToWrite(
  drafts: ActivityDraft[],
  options: { baseline: boolean; now: Date }
): Array<ActivityDraft & { seen: boolean }> {
  if (!options.baseline) {
    return drafts.map((d) => ({ ...d, seen: d.readInCanvas === true }));
  }
  const cutoff = options.now.getTime() - BASELINE_HISTORY_MS;
  return drafts
    .filter((d) => HISTORY_KINDS.has(d.kind) && d.occurredAt.getTime() >= cutoff)
    .map((d) => ({ ...d, seen: d.readInCanvas !== false }));
}

/** "Fri Oct 24, 11:59 PM" in the course's time zone. */
export function formatWhen(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("month")} ${part("day")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

/** "18 / 20", or the grade itself when there are no points ("complete", "A-"). */
export function formatScore(
  score: number | null,
  pointsPossible: number | null,
  grade: string | null
): string | null {
  if (score != null && pointsPossible != null && pointsPossible > 0) {
    return `${trimNumber(score)} / ${trimNumber(pointsPossible)}`;
  }
  if (score != null) {
    return trimNumber(score);
  }
  return grade;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The few entities Canvas bodies actually carry, plus numeric ones. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Text on one line: runs of whitespace, newlines included, become one space. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Visible text of an HTML body, whitespace collapsed — so a re-save that changes only markup isn't news. */
export function bodyText(html: string | null | undefined): string {
  if (!html) {
    return "";
  }
  return oneLine(
    decodeEntities(
      html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")
    )
  );
}

/** Short, stable fingerprint for a dedupe key (FNV-1a, hex). */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** First words of a body, for a feed line. */
export function excerpt(text: string, max = 140): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
