import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { deactivateActiveCycles } from "@/lib/erwin/goal-cycles";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ErwinCycleAPI";

/**
 * GET /api/erwin/cycles/[id]
 * Returns a single cycle (with its goals) scoped to the authenticated user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const { id } = await params;
    const cycle = await prisma.goalCycle.findUnique({
      where: { id, userId: auth.userId },
      include: { goals: true },
    });

    if (!cycle) {
      return new NextResponse("Cycle not found", { status: 404 });
    }

    return NextResponse.json(cycle);
  } catch (error) {
    logger.error(
      "Error fetching goal cycle:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/**
 * PUT /api/erwin/cycles/[id]
 * Updates a cycle. Activating it (status "active") deactivates the current
 * active cycle to keep one active cycle per user.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const { id } = await params;

    const existing = await prisma.goalCycle.findUnique({
      where: { id, userId },
    });
    if (!existing) {
      return new NextResponse("Cycle not found", { status: 404 });
    }

    const json = await request.json();
    const { theme, startDate, endDate, status } = json;

    const updated = await prisma.$transaction(async (tx) => {
      if (status === "active") {
        await deactivateActiveCycles(tx, userId, id);
      }
      return tx.goalCycle.update({
        where: { id, userId },
        data: {
          ...(theme !== undefined && { theme }),
          ...(startDate !== undefined && { startDate: newDate(startDate) }),
          ...(endDate !== undefined && { endDate: newDate(endDate) }),
          ...(status !== undefined && { status }),
        },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error(
      "Error updating goal cycle:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

/**
 * DELETE /api/erwin/cycles/[id]
 * Deletes a cycle (cascades to its goals; tasks keep their goalId set null).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const { id } = await params;

    const existing = await prisma.goalCycle.findUnique({
      where: { id, userId },
    });
    if (!existing) {
      return new NextResponse("Cycle not found", { status: 404 });
    }

    await prisma.goalCycle.delete({ where: { id, userId } });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error(
      "Error deleting goal cycle:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
