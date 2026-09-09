"use client";

import { format } from "date-fns";
import { HiMenu } from "react-icons/hi";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";

import {
  BarButton,
  BarDivider,
  BarIconButton,
  BarSegmented,
  type BarSegment,
} from "@/components/navigation/top-bar-parts";

import { addDays, newDate, subDays } from "@/lib/date-utils";

import { useCalendarUIStore, useViewStore } from "@/store/calendar";
import { useTaskStore } from "@/store/task";

import { CalendarView } from "@/types/calendar";

/**
 * The calendar's share of the app top bar. This was the calendar's own 48px
 * header until the bar absorbed it; it lives here rather than in AppTopBar so
 * the calendar's knowledge of periods, stepping and views stays in the
 * calendar folder. All of its state is already global (store/calendar.ts), so
 * nothing is prop-drilled and Calendar.tsx never learns the bar exists.
 */

const VIEW_SEGMENTS: ReadonlyArray<BarSegment<CalendarView>> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "multiMonth", label: "Year" },
];

/**
 * The heading names the period on screen, not the cursor date: a month grid is
 * titled "September 2026", not by whichever day happens to be selected. Only
 * the day view names a specific date.
 */
function formatHeading(date: Date, view: CalendarView): string {
  if (view === "multiMonth") return format(date, "yyyy");
  if (view === "day") return format(date, "EEEE, MMMM d, yyyy");
  return format(date, "MMMM yyyy");
}

export function CalendarTopBarViews() {
  const { date, setDate, view, setView } = useViewStore();
  const { isSidebarOpen, setSidebarOpen } = useCalendarUIStore();

  const step = (direction: -1 | 1) => {
    if (view === "month" || view === "multiMonth") {
      const next = new Date(date);
      next.setMonth(next.getMonth() + direction);
      setDate(next);
      return;
    }
    const days = view === "day" ? 1 : 7;
    setDate(direction === -1 ? subDays(date, days) : addDays(date, days));
  };

  return (
    <>
      <BarIconButton
        onClick={() => setSidebarOpen(!isSidebarOpen)}
        icon={HiMenu}
        label="Toggle calendar list"
        title="Toggle calendar list (b)"
        pressed={isSidebarOpen}
      />
      <BarDivider />

      <div className="flex flex-none items-center">
        <BarIconButton
          onClick={() => step(-1)}
          icon={IoChevronBack}
          label="Previous period"
          title="Previous (←)"
          data-testid="calendar-prev-week"
        />
        {/* Fixed minimum so the chevrons don't shuffle sideways between
            "May 2026" and "September 2026" as you step through the year. */}
        <span className="min-w-[8.5rem] whitespace-nowrap px-1 text-center text-[13px] font-medium tracking-tight text-foreground">
          {formatHeading(date, view)}
        </span>
        <BarIconButton
          onClick={() => step(1)}
          icon={IoChevronForward}
          label="Next period"
          title="Next (→)"
          data-testid="calendar-next-week"
        />
      </div>

      <BarButton onClick={() => setDate(newDate())} title="Go to today (t)">
        Today
      </BarButton>

      <BarSegmented
        label="Calendar view"
        segments={VIEW_SEGMENTS}
        value={view}
        onChange={setView}
      />
    </>
  );
}

export function CalendarTopBarActions() {
  const scheduleAllTasks = useTaskStore((s) => s.scheduleAllTasks);
  return <BarButton onClick={() => scheduleAllTasks()}>Auto Schedule</BarButton>;
}
