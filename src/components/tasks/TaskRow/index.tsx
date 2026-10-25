"use client";

import { useEffect, useRef, useState } from "react";

import { HiCheck, HiOutlineRefresh } from "react-icons/hi";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { newDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { Priority, type Task, TaskStatus } from "@/types/task";

import type { TaskPatch } from "../datasheet/columns";
import { useTasksLenses } from "../use-tasks-lenses";
import {
  formatContextualDate,
  formatDeferLabel,
} from "../utils/task-list-utils";
import { useTaskRowExpansion } from "./TaskRowExpansionContext";
import { TaskRowSubtasks } from "./TaskRowSubtasks";
import { TaskRowToolbar } from "./TaskRowToolbar";

interface TaskRowProps {
  task: Task;
  subtasks?: Task[];
  onPatch: (patch: TaskPatch) => Promise<void> | void;
  onOpenModal: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void> | void;
  onCreateSubtask?: (parentId: string, title: string) => Promise<void>;
}

function priorityRule(priority?: Priority | null): string {
  if (priority === Priority.HIGH) return "border-l-rust";
  if (priority === Priority.MEDIUM) return "border-l-foreground/30";
  return "border-l-transparent";
}

/**
 * Things-style task row for `/tasks`. Collapsed: scan. Expanded: the row is
 * the editor (title + due/defer/priority, and what a module adds). The full modal is for
 * recurrence, tags, and the rest.
 */
export function TaskRow({
  task,
  subtasks = [],
  onPatch,
  onOpenModal,
  onDelete,
  onStatusChange,
  onCreateSubtask,
}: TaskRowProps) {
  const { toggle, isExpanded } = useTaskRowExpansion();
  const expanded = isExpanded(task.id);
  const lenses = useTasksLenses();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [draftTitle, setDraftTitle] = useState(task.title);

  const isCompleted = task.status === TaskStatus.COMPLETED;
  const due = task.dueDate ? formatContextualDate(newDate(task.dueDate)) : null;
  const deferred = task.postponedUntil
    ? formatDeferLabel(task.postponedUntil)
    : null;
  // A word from each module about the task (Ladder: its Lord).
  const labels = lenses.flatMap((lens) => lens.rowLabel?.(task) ?? []);

  useEffect(() => {
    setDraftTitle(task.title);
  }, [task.title]);

  useEffect(() => {
    if (expanded) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [expanded]);

  const saveTitle = () => {
    const next = draftTitle.trim();
    if (!next || next === task.title) {
      setDraftTitle(task.title);
      return;
    }
    void onPatch({ ...task, title: next });
  };

  const handleComplete = async () => {
    if (isCompleted) {
      await onStatusChange(task.id, TaskStatus.TODO);
      return;
    }

    const previousStatus = task.status;
    await onStatusChange(task.id, TaskStatus.COMPLETED);

    // Recurring complete is in-place advancement on the server (new due, still
    // todo) plus a completed copy. Undo would fire that path again.
    if (task.isRecurring) {
      toast("Next occurrence scheduled");
      return;
    }

    toast("Task completed", {
      action: {
        label: "Undo",
        onClick: () => {
          void onStatusChange(task.id, previousStatus);
        },
      },
    });
  };

  const meta = [
    due ? { key: "due", text: due.text, overdue: due.isOverdue } : null,
    deferred
      ? { key: "defer", text: `Until ${deferred}`, overdue: false }
      : null,
    ...labels.map((text, i) => ({ key: `module-${i}`, text, overdue: false })),
    task.duration
      ? { key: "dur", text: `${task.duration}m`, overdue: false }
      : null,
    subtasks.length > 0
      ? {
          key: "sub",
          text: `${subtasks.filter((child) => child.status === TaskStatus.COMPLETED).length} of ${subtasks.length}`,
          overdue: false,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; text: string; overdue: boolean }>;

  return (
    <li
      className={cn(
        "group border-b border-border border-l-2 transition-colors duration-150",
        priorityRule(task.priority),
        expanded && "bg-rust/5"
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleComplete();
          }}
          aria-label={isCompleted ? "Mark as todo" : "Mark complete"}
          className="flex h-11 w-11 flex-none items-center justify-center"
        >
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center border transition-colors duration-150",
              isCompleted
                ? "border-foreground bg-foreground text-background"
                : "border-muted-foreground/50"
            )}
          >
            {isCompleted && <HiCheck className="h-3.5 w-3.5" />}
          </span>
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-3">
          {expanded ? (
            <Input
              ref={titleInputRef}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveTitle();
                  (event.target as HTMLInputElement).blur();
                }
                if (event.key === "Escape") {
                  setDraftTitle(task.title);
                }
              }}
              className="h-8 rounded-none border-0 px-0 shadow-none focus-visible:ring-0"
            />
          ) : (
            <button
              type="button"
              onClick={() => toggle(task.id)}
              className="min-w-0 flex-1 truncate text-left"
            >
              <span
                className={cn(
                  "text-sm leading-snug transition-colors duration-150",
                  isCompleted
                    ? "text-muted-foreground line-through"
                    : "text-foreground group-hover:text-rust-text"
                )}
              >
                {task.title}
              </span>
            </button>
          )}

          {/* Meta sits beside the title, not below it — a short title
              shouldn't leave the rest of the row's width blank, and every
              collapsed row stays the same height whether or not it has
              meta. Wraps only if the chips themselves overflow their own
              budget, never because the title asked for room. */}
          {!expanded && (meta.length > 0 || task.isRecurring) && (
            <button
              type="button"
              onClick={() => toggle(task.id)}
              className="flex max-w-[60%] flex-none flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-right font-mono text-[11px] uppercase tracking-wide"
            >
              {task.isRecurring && (
                <HiOutlineRefresh
                  className="h-3 w-3 text-muted-foreground"
                  aria-label="Recurring"
                />
              )}
              {meta.map((item) => (
                <span
                  key={item.key}
                  className={cn(
                    "whitespace-nowrap",
                    item.overdue ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {item.text}
                </span>
              ))}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="motion-reduce:animate-none animate-in fade-in slide-in-from-top-1 duration-200 pl-11">
          <TaskRowToolbar
            task={task}
            onPatch={(patch) => void onPatch(patch)}
            onOpenModal={onOpenModal}
            onDelete={onDelete}
          />
          {onCreateSubtask && (
            <TaskRowSubtasks
              parent={task}
              subtasks={subtasks}
              onPatch={onPatch}
              onStatusChange={onStatusChange}
              onCreateSubtask={onCreateSubtask}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
    </li>
  );
}
