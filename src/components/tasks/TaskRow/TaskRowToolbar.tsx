"use client";

import { useState } from "react";

import {
  HiCalendar,
  HiFlag,
  HiOutlineClock,
  HiOutlineFlag,
  HiOutlinePencil,
  HiOutlineRefresh,
  HiOutlineTrash,
} from "react-icons/hi";

import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  addDays,
  createUTCMidnightDate,
  endOfDay,
  newDate,
  startOfDay,
} from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { useLordStore } from "@/store/lord";
import { useModuleOn } from "@/store/modules";

import { Priority, type Task } from "@/types/task";

import type { TaskPatch } from "../datasheet/columns";
import {
  formatContextualDate,
  formatDeferLabel,
  formatEnumValue,
} from "../utils/task-list-utils";

interface TaskRowToolbarProps {
  task: Task;
  onPatch: (patch: TaskPatch) => void;
  onOpenModal: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

function ToolbarButton({
  active,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 min-w-11 items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.0875em] transition-colors duration-150",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function DateField({
  label,
  icon: Icon,
  value,
  onChange,
}: {
  label: string;
  icon: typeof HiCalendar;
  value: Date | string | null | undefined;
  onChange: (next: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Task dates are UTC midnight; feed the calendar a local calendar-day Date
  // so the highlighted day matches formatContextualDate.
  const selected = value
    ? (() => {
        const d = newDate(value);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      })()
    : undefined;
  const display = value ? formatContextualDate(newDate(value)) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolbarButton active={Boolean(value)} aria-label={label} title={label}>
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">
            {display ? display.text : label}
          </span>
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto rounded-none p-0 shadow-none"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? createUTCMidnightDate(date) : null);
            if (date) setOpen(false);
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="w-full border-t border-border px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.0875em] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function DeferField({
  value,
  onChange,
}: {
  value: Date | string | null | undefined;
  onChange: (next: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value
    ? (() => {
        const d = newDate(value);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      })()
    : undefined;
  const display = value ? formatDeferLabel(value) : null;

  const pick = (next: Date | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolbarButton
          active={Boolean(value)}
          aria-label="Defer"
          title="Hidden until this time"
        >
          <HiOutlineClock className="h-4 w-4" />
          <span className="hidden sm:inline">{display ?? "Defer"}</span>
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 rounded-none p-0 shadow-none"
      >
        <div className="flex flex-col border-b border-border">
          <button
            type="button"
            onClick={() => pick(endOfDay(newDate()))}
            className="h-11 px-3 text-left font-mono text-[11px] uppercase tracking-[0.0875em] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Later today
          </button>
          <button
            type="button"
            onClick={() => pick(startOfDay(addDays(newDate(), 1)))}
            className="h-11 px-3 text-left font-mono text-[11px] uppercase tracking-[0.0875em] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={() => pick(startOfDay(addDays(newDate(), 7)))}
            className="h-11 px-3 text-left font-mono text-[11px] uppercase tracking-[0.0875em] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Next week
          </button>
        </div>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            pick(date ? startOfDay(date) : null);
          }}
        />
        {value ? (
          <button
            type="button"
            onClick={() => pick(null)}
            className="w-full border-t border-border px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.0875em] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Quick-edit toolbar shown under an expanded TaskRow. Heavy fields (recurrence,
 * tags, description) stay in TaskModal — this is due / defer / priority / lord.
 */
export function TaskRowToolbar({
  task,
  onPatch,
  onOpenModal,
  onDelete,
}: TaskRowToolbarProps) {
  const { lords } = useLordStore();
  const ladderOn = useModuleOn("ladder");
  const taskLord = lords.find((lord) =>
    task.goalLinks?.some((link) => lord.goalIds.includes(link.goalId))
  );

  const patch = (partial: Partial<TaskPatch>) =>
    onPatch({ ...task, ...partial });

  return (
    <div className="flex flex-wrap items-center border-t border-border">
      <DateField
        label="Due"
        icon={HiCalendar}
        value={task.dueDate}
        onChange={(dueDate) => patch({ dueDate })}
      />
      <DeferField
        value={task.postponedUntil}
        onChange={(postponedUntil) => patch({ postponedUntil })}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarButton
            active={Boolean(task.priority && task.priority !== Priority.NONE)}
            aria-label="Priority"
            title="Priority"
          >
            <HiFlag className="h-4 w-4" />
            <span className="hidden sm:inline">
              {task.priority && task.priority !== Priority.NONE
                ? formatEnumValue(task.priority)
                : "Priority"}
            </span>
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="rounded-none">
          {Object.values(Priority).map((level) => (
            <DropdownMenuItem
              key={level}
              onSelect={() =>
                patch({ priority: level === Priority.NONE ? null : level })
              }
            >
              {formatEnumValue(level)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {ladderOn ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton
              active={Boolean(taskLord)}
              aria-label="Lord"
              title="Assign Lord"
            >
              <HiOutlineFlag className="h-4 w-4" />
              <span className="hidden max-w-36 truncate sm:inline">
                {taskLord ? taskLord.title : "Lord"}
              </span>
            </ToolbarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="rounded-none">
            <DropdownMenuItem onSelect={() => patch({ goalId: null })}>
              Unassigned
            </DropdownMenuItem>
            {lords.map((lord) => (
              <DropdownMenuItem
                key={lord.id}
                onSelect={() => patch({ goalId: lord.id })}
              >
                {lord.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {task.isRecurring ? (
        <span
          className="inline-flex h-11 items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.0875em] text-muted-foreground"
          title="Recurring"
        >
          <HiOutlineRefresh className="h-4 w-4" />
          <span className="hidden sm:inline">Repeats</span>
        </span>
      ) : null}

      <span className="ml-auto flex items-center">
        <ToolbarButton
          aria-label="Open full editor"
          title="Open full editor"
          onClick={() => onOpenModal(task)}
        >
          <HiOutlinePencil className="h-4 w-4" />
          <span className="hidden sm:inline">More</span>
        </ToolbarButton>
        <ToolbarButton
          aria-label="Delete task"
          title="Delete task"
          onClick={() => onDelete(task.id)}
        >
          <HiOutlineTrash className="h-4 w-4" />
        </ToolbarButton>
      </span>
    </div>
  );
}
