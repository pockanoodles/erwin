"use client";

import { useEffect } from "react";

import { DayView } from "@/components/calendar/DayView";
import { FeedManager } from "@/components/calendar/FeedManager";
import { MonthView } from "@/components/calendar/MonthView";
import { MultiMonthView } from "@/components/calendar/MultiMonthView";
import { WeekView } from "@/components/calendar/WeekView";

import { cn } from "@/lib/utils";

import {
  useCalendarStore,
  useCalendarUIStore,
  useViewStore,
} from "@/store/calendar";
import { useTaskStore } from "@/store/task";

import { CalendarEvent, CalendarFeed } from "@/types/calendar";

interface CalendarProps {
  initialFeeds?: CalendarFeed[];
  initialEvents?: CalendarEvent[];
}

export function Calendar({
  initialFeeds = [],
  initialEvents = [],
}: CalendarProps) {
  // Period, view and the feed sidebar are all driven from the app top bar now
  // (components/calendar/CalendarTopBar.tsx) through these same stores.
  const { date: currentDate, setDate, view } = useViewStore();
  const { isSidebarOpen, isHydrated } = useCalendarUIStore();
  const { setFeeds, setEvents } = useCalendarStore();

  // Use initial data from server for hydration
  useEffect(() => {
    if (initialFeeds.length > 0) {
      setFeeds(initialFeeds);
    }

    if (initialEvents.length > 0) {
      setEvents(initialEvents);
    }

    // Only fetch from database if we didn't get initial data
    if (!initialFeeds.length || !initialEvents.length) {
      useCalendarStore.getState().loadFromDatabase();
    }

    // Always fetch tasks since they're not pre-loaded
    useTaskStore.getState().fetchTasks();
  }, [initialFeeds, initialEvents, setFeeds, setEvents]);

  return (
    <div className="flex h-full w-full">
      {/* Sidebar. Width animates against a fixed-width inner panel (same trick
          as AppNav) so nothing reflows while it collapses — and `min-w-0` is
          load-bearing: without it the flex item's `min-width: auto` let the
          mini-calendar push a nominally 224px rail out to 320px. */}
      <aside
        className={cn(
          "h-full min-w-0 flex-none overflow-hidden border-r border-border bg-background",
          "transition-[width] duration-300 ease-out motion-reduce:transition-none",
          isSidebarOpen ? "w-sidebar" : "w-0",
          !isHydrated && "duration-0"
        )}
      >
        <div className="h-full w-sidebar">
          <FeedManager />
        </div>
      </aside>

      {/* Main content. No header of its own — the grid starts directly under
          the app top bar, which owns the period, the stepping and the view. */}
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="flex-1 overflow-hidden">
          {view === "day" ? (
            <DayView currentDate={currentDate} onDateClick={setDate} />
          ) : view === "week" ? (
            <WeekView currentDate={currentDate} onDateClick={setDate} />
          ) : view === "month" ? (
            <MonthView currentDate={currentDate} onDateClick={setDate} />
          ) : (
            <MultiMonthView currentDate={currentDate} onDateClick={setDate} />
          )}
        </div>
      </main>
    </div>
  );
}
