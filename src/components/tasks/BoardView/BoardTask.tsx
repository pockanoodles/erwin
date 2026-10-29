"use client";

import { useDraggable } from "@dnd-kit/core";
import { HiClock, HiLockClosed, HiPencil, HiTrash } from "react-icons/hi";

import { format, newDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { Task, TimePreference } from "@/types/task";

import { useTasksLenses } from "../use-tasks-lenses";
import { formatContextualDate } from "../utils/task-list-utils";

interface BoardTaskProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onInlineEdit: (task: Task & { goalId?: string | null }) => void;
}

const energyLevelColors = {
  high: "bg-muted text-muted-foreground",
  medium: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

const timePreferenceColors = {
  [TimePreference.MORNING]: "bg-muted text-muted-foreground",
  [TimePreference.AFTERNOON]: "bg-muted text-muted-foreground",
  [TimePreference.EVENING]: "bg-muted text-muted-foreground",
};

// Helper function to format enum values for display
const formatEnumValue = (value: string) => {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export function BoardTask({
  task,
  onEdit,
  onDelete,
  onInlineEdit,
}: BoardTaskProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: {
        type: "task",
        task,
      },
    });
  const lenses = useTasksLenses();

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div className="group relative">
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={style}
        className={cn(
          "cursor-grab border bg-card p-3 pt-9 transition-colors duration-150 hover:border-foreground/30",
          isDragging && "opacity-50"
        )}
      >
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-2">
              {task.isAutoScheduled && (
                <div
                  className="flex items-center gap-1 text-primary"
                  title="Auto-scheduled"
                >
                  <HiClock className="h-4 w-4" />
                  {task.scheduleLocked && (
                    <HiLockClosed className="h-3 w-3" title="Schedule locked" />
                  )}
                </div>
              )}
              <h3 className="task-title text-sm font-medium">{task.title}</h3>
            </div>
          </div>

          {task.description && (
            <p className="task-description line-clamp-2 text-xs text-muted-foreground">
              {task.description}
            </p>
          )}

          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-1.5 py-0.5 text-xs"
                  style={{
                    backgroundColor: `${tag.color}20` || "var(--er-surface)",
                    color: tag.color || "var(--er-faint)",
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {task.energyLevel && (
              <span
                className={cn(
                  "px-2 py-0.5",
                  energyLevelColors[task.energyLevel]
                )}
              >
                {formatEnumValue(task.energyLevel)}
              </span>
            )}

            {task.preferredTime && (
              <span
                className={cn(
                  "px-2 py-0.5",
                  timePreferenceColors[task.preferredTime]
                )}
              >
                {formatEnumValue(task.preferredTime)}
              </span>
            )}

            {task.duration && (
              <span className="text-muted-foreground">{task.duration}m</span>
            )}

            {task.dueDate && (
              <span
                className={cn(
                  formatContextualDate(newDate(task.dueDate)).isOverdue
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {formatContextualDate(newDate(task.dueDate)).text}
              </span>
            )}

            {/* What the modules add (Ladder: the goal chip), editable in
                place. The wrapper swallows pointer events so opening one
                never starts a card drag. */}
            {lenses.some((lens) => lens.Control) ? (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {lenses.map((lens, i) =>
                  lens.Control ? (
                    <lens.Control
                      key={i}
                      task={task}
                      onPatch={onInlineEdit}
                      variant="card"
                    />
                  ) : null
                )}
              </div>
            ) : null}

            {task.isAutoScheduled &&
              task.scheduledStart &&
              task.scheduledEnd && (
                <span className="text-primary">
                  {format(newDate(task.scheduledStart), "p")} -{" "}
                  {format(newDate(task.scheduledEnd), "p")}
                  {task.scheduleScore && (
                    <span className="ml-1 text-primary/70">
                      ({Math.round(task.scheduleScore * 100)}%)
                    </span>
                  )}
                </span>
              )}
          </div>
        </div>
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-primary"
          title="Edit task"
        >
          <HiPencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
          title="Delete task"
        >
          <HiTrash className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
