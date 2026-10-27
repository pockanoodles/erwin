import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  type CorrectionField,
  correctionProblem,
  storedCorrections,
} from "@/lib/canvas/corrections";
import { syncCanvasForUser } from "@/lib/canvas/sync-canvas";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

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
 * field, op?, value, reason }`; it replaces that assignment's earlier
 * correction of the same field, and remembers what Canvas says now so a
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
        await tx.canvasCorrection.deleteMany({
          where: { courseId: row.courseId, assignmentCanvasId: row.canvasId, field, retiredAt: null },
        });
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
 * Drops a correction; the next sync (started now) puts Canvas's answer back.
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
    const { count } = await prisma.canvasCorrection.deleteMany({
      where: { id, course: { userId: auth.userId } },
    });
    if (count === 0) {
      return NextResponse.json({ error: "No such correction" }, { status: 404 });
    }
    resync(auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed("Failed to delete correction", error);
  }
}
