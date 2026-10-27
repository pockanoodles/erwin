"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { localDay, shiftDay } from "@/lib/date-utils";

import {
  JobDot,
  timeText,
  useTimeFormat,
} from "@/modules/work/components/parts";
import { useWorkStore } from "@/modules/work/store";
import type { NextShift } from "@/modules/work/types";

import type { TimeFormat } from "@/types/settings";

/** Closer than this, the strip counts down instead of naming the time. */
const SOON_MS = 3 * 3_600_000;

/** "1h 20m", "45m". */
function untilText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "On shift till 12:15 AM", "Shift in 1h 20m", "Shift tomorrow 8:45 PM". */
function statusText(
  shift: NextShift,
  now: Date,
  format: TimeFormat
): string | null {
  const start = new Date(shift.workedStart ?? shift.start);
  const end = new Date(shift.workedEnd ?? shift.end);
  if (shift.dropped || end <= now) return null;
  if (start <= now)
    return `On shift till ${timeText(end.toISOString(), format)}`;
  const ms = start.getTime() - now.getTime();
  if (ms < SOON_MS) return `Shift in ${untilText(ms)}`;
  const today = localDay(now);
  const day = localDay(start);
  const when =
    day === today
      ? ""
      : day === shiftDay(today, 1)
        ? "tomorrow "
        : `${start.toLocaleDateString(undefined, { weekday: "short" })} `;
  return `Shift ${when}${timeText(start.toISOString(), format)}`;
}

/**
 * Work's count in the top bar's status strip: the shift you're on and when
 * it ends, or the next one, in the job's colour. Nothing shows without a
 * shift in the next day and a half.
 */
export function WorkStatus() {
  const pathname = usePathname();
  const next = useWorkStore((s) => s.next);
  const loadNext = useWorkStore((s) => s.loadNext);
  const format = useTimeFormat();
  const [now, setNow] = useState(() => new Date());

  // Refresh on navigation; the store throttles it.
  useEffect(() => {
    void loadNext();
  }, [loadNext, pathname]);

  // Once a minute: the countdown moves, and a shift that's over gives way
  // to the next one.
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(new Date());
      void loadNext({ force: true });
    }, 60_000);
    return () => clearInterval(tick);
  }, [loadNext]);

  const text = next ? statusText(next, now, format) : null;
  if (!next || !text) return null;
  return (
    <Link
      href={`/work?shift=${next.id}`}
      className="flex flex-none items-center gap-x-1.5 transition-colors duration-150 hover:text-foreground"
      title={`${next.jobName}: ${next.title}${next.location ? `, ${next.location}` : ""}`}
    >
      <span aria-hidden>·</span>
      <JobDot color={next.color} />
      <span>{text}</span>
    </Link>
  );
}
