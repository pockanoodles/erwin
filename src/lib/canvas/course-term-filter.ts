import { CanvasAssignment, CanvasCourse } from "./types";

/**
 * Northeastern's Canvas never concludes enrollments or sets term/course end
 * dates, so `enrollment_state=active` returns every course back to freshman
 * year (verified live 2026-07: 38 courses, all `concluded: false`, no term
 * dates). A course is treated as live using two signals instead:
 *
 *  1. Registrar-created courses embed the term in the name
 *     ("ECON1116 30394 Principles of Microeconomics SEC 02 Spring 2026
 *     [BOS-1-TR]") — keep names matching the current term, or the upcoming
 *     term once it is within the lookahead window.
 *  2. Instructor-created shells ("CS 2100 Assignments") carry no term token —
 *     keep them only when something is due recently or in the future.
 */

type Season = "Spring" | "Summer 1" | "Summer 2" | "Fall";

/** Approximate NEU term start boundaries; month is 0-based. */
const TERM_STARTS: { season: Season; month: number; day: number }[] = [
  { season: "Spring", month: 0, day: 1 },
  { season: "Summer 1", month: 4, day: 1 },
  { season: "Summer 2", month: 6, day: 1 },
  { season: "Fall", month: 8, day: 1 },
];

/** Include the next term's courses this long before it starts. */
const UPCOMING_TERM_LOOKAHEAD_MS = 45 * 24 * 60 * 60 * 1000;

/** A shell course counts as live if anything was due within this window. */
const LIVE_ASSIGNMENT_GRACE_MS = 21 * 24 * 60 * 60 * 1000;

function tokensFor(season: Season, year: number): string[] {
  // "Summer 1 2026" / "Summer 2 2026" courses coexist with full-summer
  // "Summer 2026" ones, so summer sessions match both spellings.
  if (season === "Summer 1" || season === "Summer 2") {
    return [`${season} ${year}`, `Summer ${year}`];
  }
  return [`${season} ${year}`];
}

/**
 * Term-name tokens considered current at `now`: the in-progress term, plus
 * the upcoming term once it is within the lookahead window (so fall courses
 * published in August start syncing before September).
 */
export function currentTermTokens(now: Date): string[] {
  const year = now.getFullYear();
  let currentIdx = 0;

  // Spring starts Jan 1, so at least one term start this year is <= now.
  for (let i = 0; i < TERM_STARTS.length; i++) {
    const s = TERM_STARTS[i];
    if (new Date(year, s.month, s.day).getTime() <= now.getTime()) {
      currentIdx = i;
    }
  }

  const tokens = tokensFor(TERM_STARTS[currentIdx].season, year);

  const nextIdx = (currentIdx + 1) % TERM_STARTS.length;
  const nextYear = nextIdx === 0 ? year + 1 : year;
  const next = TERM_STARTS[nextIdx];
  const nextStart = new Date(nextYear, next.month, next.day);
  if (nextStart.getTime() - now.getTime() <= UPCOMING_TERM_LOOKAHEAD_MS) {
    tokens.push(...tokensFor(next.season, nextYear));
  }

  return tokens;
}

export function courseNameMatchesTerm(
  name: string,
  termTokens: string[]
): boolean {
  const lowered = name.toLowerCase();
  return termTokens.some((t) => lowered.includes(t.toLowerCase()));
}

/**
 * True if any assignment is due (or locks) in the future or within the grace
 * window. Undated assignments are not evidence of life — old shells are full
 * of them.
 */
export function hasLiveAssignment(
  assignments: CanvasAssignment[],
  now: Date
): boolean {
  const cutoff = now.getTime() - LIVE_ASSIGNMENT_GRACE_MS;
  return assignments.some((a) => {
    const due = a.due_at ?? a.lock_at;
    return due != null && new Date(due).getTime() >= cutoff;
  });
}

export function isTermNamedCourse(course: CanvasCourse, now: Date): boolean {
  return courseNameMatchesTerm(course.name, currentTermTokens(now));
}
