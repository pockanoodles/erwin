/**
 * What a goal made in Sigwald may claim and prove, checked before it's stored:
 * the same declarations the vault sends through pump 7, entered by hand.
 */

import type { Db } from "@/lib/prisma";

import { sourceClaims } from "@/modules";
import { moduleClaimOptions, moduleProofItems } from "@/modules/hooks";
import type { ClaimOption } from "@/modules/types";

/** Task sources a goal can claim whole: the calendars' task lists, then each one a module offers. */
export const SOURCE_CLAIMS: readonly ClaimOption[] = [
  { key: "GOOGLE", label: "Google Tasks", title: "Every task from Google Tasks" },
  { key: "OUTLOOK", label: "Outlook tasks", title: "Every task from Outlook" },
  ...sourceClaims(),
];

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A goal's claims: whole sources, `project:<id>`, or a claim a module offers
 * (Courses: `course:<Canvas course id>`), each one the user's own. Undefined
 * when the request leaves them alone.
 */
export async function checkClaims(db: Db, userId: string, raw: unknown): Promise<Checked<string[] | undefined>> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(raw) || raw.some((c) => typeof c !== "string")) {
    return { ok: false, error: "taskSources must be a list of claims" };
  }
  const claims = [...new Set(raw as string[])];
  const projectIds = claims.flatMap((c) => (c.startsWith("project:") ? [c.slice(8)] : []));
  const offered = new Set([...SOURCE_CLAIMS, ...(await moduleClaimOptions(db, userId))].map((o) => o.key));
  const loose = claims.filter((c) => !c.startsWith("project:") && !offered.has(c));
  if (loose.length) return { ok: false, error: `unknown claim ${loose[0]}` };
  const projects = projectIds.length ? await db.project.count({ where: { id: { in: projectIds }, userId } }) : 0;
  if (projects !== projectIds.length) {
    return { ok: false, error: "a claimed project wasn't found" };
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
    const [item] = await moduleProofItems(db, userId, [canvasAssignmentId]);
    if (!item) return { ok: false, error: "that Canvas item isn't in your gradebook" };
  }
  if (proofTaskId) {
    const task = await db.task.findFirst({ where: { id: proofTaskId, userId }, select: { id: true } });
    if (!task) return { ok: false, error: "that task wasn't found" };
  }
  return { ok: true, value: { canvasAssignmentId, proofTaskId } };
}
