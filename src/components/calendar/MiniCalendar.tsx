import { useState } from "react";

import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
} from "date-fns";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";

import { cn } from "@/lib/utils";

interface MiniCalendarProps {
  currentDate: Date;
  onDateClick?: (date: Date) => void;
}

export function MiniCalendar({ currentDate, onDateClick }: MiniCalendarProps) {
  const [calendarDate, setCalendarDate] = useState(currentDate);
  const monthStart = startOfMonth(calendarDate);
  const monthEnd = endOfMonth(calendarDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get day names with unique keys
  const weekDays = [
    { key: "mon", label: "M" },
    { key: "tue", label: "T" },
    { key: "wed", label: "W" },
    { key: "thu", label: "T" },
    { key: "fri", label: "F" },
    { key: "sat", label: "S" },
    { key: "sun", label: "S" },
  ];

  const handlePrevMonth = () => {
    const newDate = new Date(calendarDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCalendarDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(calendarDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCalendarDate(newDate);
  };

  // Get the day of week of the first day (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const firstDayOfMonth = monthStart.getDay();
  // Adjust for Monday start (transform Sunday from 0 to 7)
  const adjustedFirstDay = firstDayOfMonth === 0 ? 7 : firstDayOfMonth;
  // Calculate empty days needed before the first day
  const emptyDays = adjustedFirstDay - 1;

  return (
    <div className="px-2 py-1">
      {/* Month Navigation */}
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-foreground">
          {format(calendarDate, "MMMM yyyy")}
        </h2>
        <div className="flex items-center">
          <button
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="p-1 text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <IoChevronBack className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleNextMonth}
            aria-label="Next month"
            className="p-1 text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <IoChevronForward className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Calendar Grid — 7 × 24px keeps the whole panel inside the 224px
          sidebar (the `w-sidebar` token, 14rem). */}
      <div className="grid grid-cols-7">
        {/* Weekday headers */}
        {weekDays.map((day) => (
          <div
            key={day.key}
            className="flex h-6 items-center justify-center text-[10px] font-medium text-muted-foreground"
          >
            {day.label}
          </div>
        ))}

        {/* Empty days */}
        {Array.from({ length: emptyDays }).map((_, index) => (
          <div key={`empty-${index}`} className="h-6" />
        ))}

        {/* Calendar days */}
        {days.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => onDateClick?.(day)}
            className={cn(
              "flex h-6 items-center justify-center text-[11px] tabular-nums transition-colors duration-150",
              isSameDay(day, currentDate)
                ? "bg-rust font-semibold text-rust-foreground"
                : isToday(day)
                  ? "font-semibold text-rust-text hover:bg-muted/50"
                  : isSameMonth(day, calendarDate)
                    ? "text-foreground hover:bg-muted/50"
                    : "text-muted-foreground/50 hover:bg-muted/50"
            )}
          >
            {format(day, "d")}
          </button>
        ))}
      </div>
    </div>
  );
}
