/**
 * What a Canvas sync couldn't do, one line each. The lines join into the
 * provider's `error`, which the Courses top bar shows and ops' health check
 * pages on, so a read that keeps failing never goes quiet.
 */
import { CanvasApiError } from "@/lib/canvas/canvas-client";
import type { CanvasCourse } from "@/lib/canvas/types";

const MAX_REASON = 120;
const MAX_LISTED = 3;

/** "MISM2301" from "MISM2301.10244.202710". */
export function courseLabel(course: CanvasCourse): string {
  return course.course_code?.split(".")[0] ?? String(course.id);
}

/** "announcements unavailable (Canvas 503)" */
export function syncProblem(what: string, error: unknown): string {
  return `${what} (${reason(error)})`;
}

function reason(error: unknown): string {
  if (error instanceof CanvasApiError) {
    return `Canvas ${error.status}`;
  }
  const text = error instanceof Error ? error.message : String(error);
  const line = text.trim().split("\n")[0].trim() || "unknown error";
  return line.length > MAX_REASON ? `${line.slice(0, MAX_REASON - 1)}…` : line;
}

/** The provider error for one sync's problems; null when it had none. */
export function syncErrorText(problems: string[]): string | null {
  if (problems.length === 0) {
    return null;
  }
  const listed = problems.slice(0, MAX_LISTED).join("; ");
  const more = problems.length - MAX_LISTED;
  return more > 0 ? `${listed}; and ${more} more` : listed;
}
