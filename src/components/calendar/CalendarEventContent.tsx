import { memo } from "react";

import type { EventContentArg } from "@fullcalendar/core";
import { IoCheckmarkCircle, IoRepeat } from "react-icons/io5";

import {
  getMonthEventDisplay,
  isDayGridView,
} from "@/lib/calendar-event-display";
import { isTaskOverdue } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

import { useSettingsStore } from "@/store/settings";

import { Priority, TaskStatus } from "@/types/task";

const DEFAULT_EVENT_COLOR = "#3b82f6";

interface CalendarEventContentProps {
  eventInfo: EventContentArg;
}

const priorityColors = {
  [Priority.HIGH]: "border-red-500",
  [Priority.MEDIUM]: "border-orange-500",
  [Priority.LOW]: "border-blue-500",
  [Priority.NONE]: "border-muted-foreground",
};

export const CalendarEventContent = memo(function CalendarEventContent({
  eventInfo,
}: CalendarEventContentProps) {
  const { user: userSettings } = useSettingsStore();
  const isTask = eventInfo.event.extendedProps.isTask;
  const isRecurring = eventInfo.event.extendedProps.isRecurring;
  const status = eventInfo.event.extendedProps.status;
  const priority = eventInfo.event.extendedProps.priority;
  const location = eventInfo.event.extendedProps.location;
  const calendarName = eventInfo.event.extendedProps.calendarName;
  const dueDate = eventInfo.event.extendedProps?.extendedProps?.dueDate;
  const title = eventInfo.event.title;
  const endTime = eventInfo.event.end?.getTime() ?? 0;
  const startTime = eventInfo.event.start?.getTime() ?? 0;
  const duration = endTime - startTime;

  const isOverdue = isTask && isTaskOverdue({ dueDate, status });

  // Issue #95: surface the start time and calendar color for timed events in
  // month/multi-month views so they read as clearly as the colored all-day
  // events. Time-grid (day/week) views are unaffected.
  // Format the chip in the same time zone FullCalendar renders with (its
  // `local` sentinel today) so the chip time always matches the calendar's own
  // display, even if the browser's local zone differs from the configured one.
  const calendarTimeZone =
    (eventInfo.view.calendar.getOption("timeZone") as string | undefined) ??
    "local";
  // Which chips sit on a tint of the page rather than a fill: every day-grid
  // chip, plus the all-day row above the day and week grids.
  const isTintedChip =
    isDayGridView(eventInfo.view.type) || eventInfo.event.allDay;
  const { isDayGridTimed, showTimeChip, timeText } = getMonthEventDisplay({
    viewType: eventInfo.view.type,
    allDay: eventInfo.event.allDay,
    isTask: !!isTask,
    start: eventInfo.event.start,
    isStart: eventInfo.isStart,
    timeFormat: userSettings.timeFormat,
    timeZone: calendarTimeZone,
  });
  // Border first: month chips tint their background, so only the border still
  // carries the calendar colour at full strength.
  const eventColor =
    eventInfo.event.borderColor ||
    eventInfo.event.backgroundColor ||
    DEFAULT_EVENT_COLOR;

  return (
    <div
      data-testid={isTask ? "calendar-task" : "calendar-event"}
      className={cn(
        "flex h-full flex-col justify-start gap-1 overflow-hidden text-[11px]",
        // Tinted chips take page foreground. Time-grid blocks are still filled
        // with the calendar's full-strength colour and must keep inheriting
        // FullCalendar's on-fill text colour instead.
        isTintedChip && "text-foreground",
        isTask && "border-l-4",
        isTask && priority && priorityColors[priority as Priority],
        isTask &&
          !priority && {
            "border-green-500": status === TaskStatus.COMPLETED,
            "border-yellow-500": status === TaskStatus.IN_PROGRESS,
            "border-muted-foreground": status === TaskStatus.TODO,
          },
        // Overdue reads from the priority bar and the weight, not from a red
        // title. A chip is tinted with its own calendar's colour, which the
        // user picks — a light one (a near-white task colour, say) drops red
        // text to ~2.7:1 on dark. The bar is drawn over the page, so it stays
        // legible whatever the fill happens to be.
        isOverdue && "border-red-600 font-medium dark:border-red-400",
        status === TaskStatus.COMPLETED && "text-muted-foreground line-through"
      )}
    >
      <div className="flex w-full items-baseline gap-1.5">
        {/* Leading mark. All-day events carry no icon: in a month cell the
            chip's own tint already says "all day", and a clock on every one of
            them was the single biggest source of visual noise in the grid. */}
        {isTask ? (
          <IoCheckmarkCircle className="h-3.5 w-3.5 flex-shrink-0 self-center text-current opacity-75" />
        ) : isRecurring ? (
          <IoRepeat
            className="h-3.5 w-3.5 flex-shrink-0 self-center"
            style={{ color: showTimeChip ? eventColor : undefined }}
          />
        ) : showTimeChip ? (
          <span
            aria-hidden="true"
            className="h-2 w-2 flex-shrink-0 self-center rounded-full"
            style={{ backgroundColor: eventColor }}
          />
        ) : null}
        <div
          className={cn(
            "calendar-event-title min-w-0 flex-1 font-medium leading-snug",
            duration <= 1800000 ? "truncate" : "line-clamp-2 break-words"
          )}
        >
          {isDayGridTimed && calendarName && (
            <span className="sr-only">{calendarName}, </span>
          )}
          {title}
        </div>
        {/* Time trails the title, right-aligned and muted, so a column of chips
            scans as titles first and times second. */}
        {showTimeChip && timeText && (
          <span className="flex-none font-normal tabular-nums text-muted-foreground">
            {timeText}
          </span>
        )}
      </div>
      {location && duration > 1800000 && (
        <div className="event-location truncate pl-5 text-[10px] leading-snug opacity-80">
          {location}
        </div>
      )}
    </div>
  );
});
