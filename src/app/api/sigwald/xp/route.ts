import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { ensureCurrentHex } from "@/lib/sigwald/hex";
import { buildXpReport } from "@/lib/sigwald/xp-report";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { moduleOffResponse } from "@/modules/api";

const LOG_SOURCE = "SigwaldXpAPI";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: string) =>
  DAY.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value);

/** A date-only value (a boss's day, stored at noon UTC) keeps its own date. */
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /api/sigwald/xp?from=2026-10-18&to=2026-10-24
 *
 * The XP a span of days added (inclusive, in the user's zone) and all XP
 * through its last day, per stat, with the goals behind it. ops' weekly report
 * and HUD read this instead of working the economy out a second time
 * (lib/sigwald/xp-report.ts). `to` defaults to today, `from` to six days
 * before `to`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const off = await moduleOffResponse(auth.userId, "ladder");
    if (off) return off;

    const userId = auth.userId;
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    });
    const timeZone = settings?.timeZone ?? "UTC";
    const dayOf = (d: Date) => formatInTimeZone(d, timeZone, "yyyy-MM-dd");

    const params = request.nextUrl.searchParams;
    const to = params.get("to") ?? dayOf(newDate());
    const from =
      params.get("from") ??
      (isDay(to) ? dateOnly(new Date(Date.parse(`${to}T00:00:00.000Z`) - 6 * 86_400_000)) : "");
    if (!isDay(from) || !isDay(to) || from > to) {
      return NextResponse.json(
        { error: "from and to must be days (YYYY-MM-DD), from no later than to" },
        { status: 400 }
      );
    }

    const running = await ensureCurrentHex(prisma, userId);
    const [goals, done] = await Promise.all([
      prisma.goal.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          isBoss: true,
          status: true,
          develops: true,
          targetDate: true,
          updatedAt: true,
          externalId: true,
          cycleId: true,
          parentLinks: { select: { parentId: true } },
        },
      }),
      // Subtasks are checklist items under a task, not work of their own.
      prisma.task.findMany({
        where: { userId, parentTaskId: null, status: "completed", completedAt: { not: null } },
        select: { id: true, completedAt: true, source: true, goalLinks: { select: { goalId: true } } },
      }),
    ]);

    return NextResponse.json(
      buildXpReport({
        from,
        to,
        currentCycleId: running.id,
        goals: goals.map((goal) => ({
          id: goal.id,
          title: goal.title,
          isBoss: goal.isBoss,
          status: goal.status,
          develops: goal.develops,
          parentIds: goal.parentLinks.map((link) => link.parentId),
          day: goal.targetDate ? dateOnly(goal.targetDate) : null,
          updatedDay: dayOf(goal.updatedAt),
          externalId: goal.externalId,
          cycleId: goal.cycleId,
        })),
        done: done.map((task) => ({
          id: task.id,
          day: dayOf(task.completedAt!),
          source: task.source,
          goalIds: task.goalLinks.map((link) => link.goalId),
        })),
      })
    );
  } catch (error) {
    logger.error(
      "Sigwald XP report failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Failed to build the XP report" }, { status: 500 });
  }
}
