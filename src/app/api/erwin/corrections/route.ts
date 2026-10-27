import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  type CorrectionField,
  correctionProblem,
  storedCorrections,
} from "@/lib/canvas/corrections";
import { DONE_STATES } from "@/lib/canvas/gradebook-plan";
import { syncCanvasForUser } from "@/lib/canvas/sync-canvas";
import { logger } from "@/lib/logger";
import { type DbTransaction, prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "ErwinCorrectionsAPI";

// One assignment (by its Erwin task or gradebook row), or a course rule.
const postSchema = z.object({
  taskId: z.string().min(1).optional(),
  assignmentId: z.string().min(1).optional(),
  courseId: z.string().min(1).optional(),
  nameMatch: z.string().min(1).max(200).optional(),
  submissionType: z.string().min(1).max(50).optional(),
  field: z.string().min(1),
  op: z.string().min(1).default("set"),
  value: z.string().min(1).max(100),
  reason: z.string().min(1).max(300),
});

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Corrections change what sync writes, so the next sync is what shows them.
 * It runs now rather than at the next tick; the response doesn't wait for it.
 */
function resync(userId: string) {
  void syncCanvasForUser(userId).catch((error) =>
    logger.error(
      "Canvas sync after a correction failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    )
  );
}

/**
 * Stops corrections applying. They're retired, not deleted, so the record of
 * what was corrected stays and sync can tell Kaito's own change from news.
 * Work one of them had handed in reopens here, in the same transaction:
 * waiting for sync would lose it if that sync died halfway.
 */
async function retire(tx: DbTransaction, ids: string[], note: string, now: Date) {
  if (ids.length === 0) {
    return;
  }
  const courses = await tx.canvasCorrection.findMany({
    where: { id: { in: ids } },
    select: { courseId: true },
    distinct: ["courseId"],
  });
  await tx.canvasCorrection.updateMany({
    where: { id: { in: ids } },
    data: { retiredAt: now, retiredNote: note },
  });
  const rows = await tx.courseAssignment.findMany({
    where: {
      courseId: { in: courses.map((c) => c.courseId) },
      taskId: { not: null },
      corrections: { not: Prisma.DbNull },
    },
    select: { taskId: true, corrections: true },
  });
  const handedIn = rows.filter((r) =>
    storedCorrections(r.corrections).some(
      (a) =>
        a.field === "state" &&
        ids.includes(a.id) &&
        DONE_STATES.has(a.value ?? "") &&
        !DONE_STATES.has(a.canvas ?? "")
    )
  );
  if (handedIn.length > 0) {
    await tx.task.updateMany({
      where: { id: { in: handedIn.map((r) => r.taskId!) }, status: "completed" },
      data: { status: "todo", completedAt: null },
    });
  }
}

function failed(what: string, error: unknown) {
  logger.error(what, { error: error instanceof Error ? error.message : "Unknown error" }, LOG_SOURCE);
  return NextResponse.json({ error: what }, { status: 500 });
}

/**
 * GET /api/erwin/corrections[?courseId=<Erwin course id>]
 *
 * Every correction, newest first, retired ones included (`retiredAt`,
 * `retiredNote` say when and why Canvas took over again).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "courses");
    if (off) return off;
    const courseId = request.nextUrl.searchParams.get("courseId") ?? undefined;
    const rows = await prisma.canvasCorrection.findMany({
      where: { course: { userId: auth.userId }, ...(courseId ? { courseId } : {}) },
      orderBy: { createdAt: "desc" },
      include: { course: { select: { code: true, name: true } } },
    });
    return NextResponse.json(rows);
  } catch (error) {
    return failed("Failed to load corrections", error);
  }
}

/**
 * POST /api/erwin/corrections
 *
 * Says where Canvas is wrong. For one assignment, `{ taskId | assignmentId,
 * field, op?, value, reason }`; it replaces (retires) that assignment's
 * earlier correction of the same field, and remembers what Canvas says now so a
 * change there retires it. For a course rule, `{ courseId, nameMatch?,
 * submissionType?, field, op, value, reason }` with at least one filter.
 * Fields: state | dueAt | lockAt. Ops: set (a state, or an ISO date-time) |
 * setTime ("HH:mm" in the course's zone, the day stays Canvas's).
 * Nothing is written to Canvas.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "courses");
    if (off) return off;
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const single = body.taskId ?? body.assignmentId;
    if ((single == null) === (body.courseId == null)) {
      return NextResponse.json(
        { error: "Give taskId or assignmentId for one assignment, or courseId for a course rule" },
        { status: 400 }
      );
    }

    if (single != null) {
      const row = await prisma.courseAssignment.findFirst({
        where: {
          course: { userId: auth.userId },
          ...(body.taskId ? { taskId: body.taskId } : { id: body.assignmentId }),
        },
      });
      if (!row) {
        return NextResponse.json({ error: "No Canvas assignment for that id" }, { status: 404 });
      }
      const problem = correctionProblem({ ...body, assignmentCanvasId: row.canvasId });
      if (problem) {
        return NextResponse.json({ error: problem }, { status: 400 });
      }
      const field = body.field as CorrectionField;
      // The row holds the corrected value; what Canvas said is kept beside it.
      const prior = storedCorrections(row.corrections).find((a) => a.field === field);
      const stored = row[field];
      const canvasValue = prior ? prior.canvas : stored instanceof Date ? iso(stored) : stored;
      const correction = await prisma.$transaction(async (tx) => {
        const replaced = await tx.canvasCorrection.findMany({
          where: { courseId: row.courseId, assignmentCanvasId: row.canvasId, field, retiredAt: null },
          select: { id: true },
        });
        await retire(tx, replaced.map((c) => c.id), "Replaced by a newer correction", new Date());
        return tx.canvasCorrection.create({
          data: {
            courseId: row.courseId,
            assignmentCanvasId: row.canvasId,
            field,
            op: body.op,
            value: body.value,
            reason: body.reason,
            canvasValue,
          },
        });
      });
      resync(auth.userId);
      return NextResponse.json(correction, { status: 201 });
    }

    const course = await prisma.course.findFirst({
      where: { id: body.courseId, userId: auth.userId },
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json({ error: "No such course" }, { status: 404 });
    }
    const problem = correctionProblem(body);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    const correction = await prisma.canvasCorrection.create({
      data: {
        courseId: course.id,
        nameMatch: body.nameMatch ?? null,
        submissionType: body.submissionType ?? null,
        field: body.field,
        op: body.op,
        value: body.value,
        reason: body.reason,
      },
    });
    resync(auth.userId);
    return NextResponse.json(correction, { status: 201 });
  } catch (error) {
    return failed("Failed to save correction", error);
  }
}

/**
 * DELETE /api/erwin/corrections?id=<correction id>
 *
 * Drops a correction (it stays listed, retired as "Deleted"); work it had
 * handed in reopens, and the next sync (started now) puts Canvas's answer back.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "courses");
    if (off) return off;
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const found = await prisma.canvasCorrection.findFirst({
      where: { id, course: { userId: auth.userId }, retiredAt: null },
      select: { id: true },
    });
    if (!found) {
      return NextResponse.json({ error: "No such correction in force" }, { status: 404 });
    }
    await prisma.$transaction((tx) => retire(tx, [found.id], "Deleted", new Date()));
    resync(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed("Failed to delete correction", error);
  }
}
