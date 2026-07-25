"use client";

import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";

import { Task, TaskStatus } from "@/types/task";

import { BoardTask } from "./BoardTask";

interface ColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const statusDots = {
  [TaskStatus.TODO]: "bg-amber-500",
  [TaskStatus.IN_PROGRESS]: "bg-cobalt",
  [TaskStatus.COMPLETED]: "bg-green-600",
};

// Helper function to format enum values for display
const formatEnumValue = (value: string) => {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export function Column({ status, tasks, onEdit, onDelete }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-72 flex-1 flex-col border border-border bg-background",
        isOver && "ring-1 ring-cobalt"
      )}
    >
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 flex-none", statusDots[status])} />
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
              {formatEnumValue(status)}
            </span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          {tasks.map((task) => (
            <BoardTask
              key={task.id}
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
