/**
 * Hexes: the year splits into six fixed two-month blocks (Jan–Feb, Mar–Apr,
 * May–Jun, Jul–Aug, Sep–Oct, Nov–Dec). The current hex always exists — there
 * is no "no active season" state; `ensureCurrentHex` lazily provisions the
 * GoalCycle row for the hex covering today.
 */

import type { GoalCycle } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import type { Db } from "@/lib/prisma";

import { deactivateActiveCycles } from "./goal-cycles";

export interface Hex {
  year: number;
  /** 1–6 within the year */
  index: number;
  /** first day of the first month, UTC midnight */
  startDate: Date;
  /** last day of the second month, 23:59:59.999 UTC */
  endDate: Date;
}

const MONTH_ABBREV = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function hexForDate(date: Date): Hex {
  const year = date.getUTCFullYear();
  const index = Math.floor(date.getUTCMonth() / 2) + 1;
  return hexOf(year, index);
}

export function hexOf(year: number, index: number): Hex {
  const startMonth = (index - 1) * 2;
  return {
    year,
    index,
    startDate: new Date(Date.UTC(year, startMonth, 1)),
    // Day 0 of month+2 = last day of the hex's second month.
    endDate: new Date(Date.UTC(year, startMonth + 2, 0, 23, 59, 59, 999)),
  };
}

/** e.g. "Hex 4 · Jul–Aug 2026" */
export function hexLabel(hex: Pick<Hex, "year" | "index">): string {
  const startMonth = (hex.index - 1) * 2;
  return `Hex ${hex.index} · ${MONTH_ABBREV[startMonth]}–${MONTH_ABBREV[startMonth + 1]} ${hex.year}`;
}

/**
 * Returns the GoalCycle for the hex covering today, creating and activating it
 * if needed. Any active cycle that has already ended is marked completed;
 * other stray actives are archived (one active cycle per user).
 */
export async function ensureCurrentHex(
  prisma: Db,
  userId: string
): Promise<GoalCycle> {
  const now = newDate();
  const hex = hexForDate(now);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.goalCycle.findFirst({
      where: { userId, startDate: hex.startDate, endDate: hex.endDate },
    });
    if (existing) {
      if (existing.status === "active") {
        return existing;
      }
      await deactivateActiveCycles(tx, userId, existing.id);
      return tx.goalCycle.update({
        where: { id: existing.id },
        data: { status: "active" },
      });
    }

    // Rollover: actives that have ended are completed, not archived.
    await tx.goalCycle.updateMany({
      where: { userId, status: "active", endDate: { lt: now } },
      data: { status: "completed" },
    });
    await deactivateActiveCycles(tx, userId);
    return tx.goalCycle.create({
      data: {
        theme: "",
        startDate: hex.startDate,
        endDate: hex.endDate,
        status: "active",
        userId,
      },
    });
  });
}
