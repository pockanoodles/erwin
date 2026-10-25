/**
 * What a goal made in Erwin may claim and prove, checked before it's stored:
 * the same declarations the vault sends through pump 7, entered by hand.
 */

import type { Db } from "@/lib/prisma";

/** Task sources a goal can claim whole. */
export const CLAIMABLE_SOURCES = ["CANVAS", "GOOGLE", "OUTLOOK"] as const;

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A goal's claims: whole sources, `course:<Canvas course id>` (what a task
 * carries as its courseId) and `project:<id>`, each one the user's own.
 * Undefined when the request leaves them alone.
 */
export async function checkClaims(db: Db, userId: string, raw: unknown): Promise<Checked<string[] | undefined>> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(raw) || raw.some((c) => typeof c !== "string")) {
    return { ok: false, error: "taskSources must be a list of claims" };
  }
  const claims = [...new Set(raw as string[])];
  const courseIds = claims.flatMap((c) => (c.startsWith("course:") ? [c.slice(7)] : []));
  const projectIds = claims.flatMap((c) => (c.startsWith("project:") ? [c.slice(8)] : []));
  const loose = claims.filter(
    (c) => !c.startsWith("course:") && !c.startsWith("project:") && !(CLAIMABLE_SOURCES as readonly string[]).includes(c)
  );
  if (loose.length) return { ok: false, error: `unknown claim ${loose[0]}` };
  const [courses, projects] = await Promise.all([
    courseIds.length ? db.course.count({ where: { canvasId: { in: courseIds }, userId } }) : 0,
    projectIds.length ? db.project.count({ where: { id: { in: projectIds }, userId } }) : 0,
  ]);
  if (courses !== courseIds.length || projects !== projectIds.length) {
    return { ok: false, error: "a claimed course or project wasn't found" };
  }
  return { ok: true, value: claims };
}

export interface Proof {
  canvasAssignmentId: string | null;
  proofTaskId: string | null;
}

/**
 * A boss's proof: one Canvas gradebook item or one task of the user's, or
 * neither (marked by hand). Undefined when the request leaves it alone.
 */
export async function checkProof(
  db: Db,
  userId: string,
  raw: { canvasAssignmentId?: unknown; proofTaskId?: unknown }
): Promise<Checked<Proof | undefined>> {
  if (raw.canvasAssignmentId === undefined && raw.proofTaskId === undefined) {
    return { ok: true, value: undefined };
  }
  const canvasAssignmentId = raw.canvasAssignmentId == null ? null : String(raw.canvasAssignmentId);
  const proofTaskId = raw.proofTaskId == null ? null : String(raw.proofTaskId);
  if (canvasAssignmentId && proofTaskId) {
    return { ok: false, error: "a boss has one proof: a Canvas item or a task" };
  }
  if (canvasAssignmentId) {
    const item = await db.courseAssignment.findFirst({
      where: { canvasId: canvasAssignmentId, course: { userId } },
      select: { id: true },
    });
    if (!item) return { ok: false, error: "that Canvas item isn't in your gradebook" };
  }
  if (proofTaskId) {
    const task = await db.task.findFirst({ where: { id: proofTaskId, userId }, select: { id: true } });
    if (!task) return { ok: false, error: "that task wasn't found" };
  }
  return { ok: true, value: { canvasAssignmentId, proofTaskId } };
}
