"use client";

import { HiCheck, HiOutlineTrash } from "react-icons/hi";

import { newDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { useLordStore } from "@/store/lord";

import { TaskStatus, type Task } from "@/types/task";

import { formatContextualDate } from "./utils/task-list-utils";

interface TaskCardsProps {
  /** Already filtered and sorted by TaskList. */
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

/**
 * The phone rendering of the task list.
 *
 * Not a squeezed datasheet. The sheet is 1456px of fixed columns and 26px rows
 * — its own header comment calls the density deliberate and desktop-only, and
 * 26px is well under the 44px touch floor. Shrinking it would produce a grid
 * you can neither read nor hit. So the same tasks get a different shape: one
 * row per task at a tappable height, the title given room to wrap because on a
 * phone the title is the whole point, and the scanning columns demoted to a
 * single meta line underneath.
 *
 * Editing stays in the modal here rather than the value bar — the bar exists to
 * serve a grid whose cells are too small, and these cells aren't.
 */
export function TaskCards({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
}: TaskCardsProps) {
  const { lords } = useLordStore();

  const lordTitleFor = (task: Task) => {
    if (!task.goalLinks?.length) return null;
    const linked = new Set(task.goalLinks.map((l) => l.goalId));
    return lords.find((lord) => lord.goalIds.some((id) => linked.has(id)))
      ?.title;
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No tasks match.</p>
      </div>
    );
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {tasks.map((task) => {
        const isCompleted = task.status === TaskStatus.COMPLETED;
        // The store holds dates as ISO strings straight off the API, not Date
        // objects — formatContextualDate calls getUTCFullYear and throws on a
        // raw string.
        const due = task.dueDate
          ? formatContextualDate(newDate(task.dueDate))
          : null;
        const lordTitle = lordTitleFor(task);

        const meta = [
          task.duration ? `${task.duration}m` : null,
          task.priority ?? null,
          lordTitle,
        ].filter(Boolean) as string[];

        return (
          <li
            key={task.id}
            className="flex items-start gap-1 border-b border-border"
          >
            <button
              onClick={() =>
                onStatusChange(
                  task.id,
                  isCompleted ? TaskStatus.TODO : TaskStatus.COMPLETED
                )
              }
              aria-label={isCompleted ? "Mark as todo" : "Mark complete"}
              className="flex h-12 w-12 flex-none items-center justify-center"
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

            <button
              onClick={() => onEdit(task)}
              className="min-w-0 flex-1 py-2.5 pr-1 text-left"
            >
              <span
                className={cn(
                  "block text-sm leading-snug",
                  isCompleted
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                )}
              >
                {task.title}
              </span>

              {(due || meta.length > 0) && (
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] uppercase tracking-wide">
                  {due && (
                    <span
                      className={cn(
                        due.isOverdue
                          ? "text-red-700 dark:text-red-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {due.text}
                    </span>
                  )}
                  {meta.map((m) => (
                    <span key={m} className="text-muted-foreground">
                      {m}
                    </span>
                  ))}
                </span>
              )}
            </button>

            <button
              onClick={() => onDelete(task.id)}
              aria-label="Delete task"
              className="flex h-12 w-11 flex-none items-center justify-center text-muted-foreground"
            >
              <HiOutlineTrash className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
