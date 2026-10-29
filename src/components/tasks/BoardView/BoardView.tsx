"use client";

import { useMemo } from "react";

import { DndContext, DragEndEvent } from "@dnd-kit/core";

import { Task, TaskStatus } from "@/types/task";

import { TaskListToolbar } from "../TaskListToolbar";
import { useVisibleTasks } from "../filters/use-visible-tasks";
import { Column } from "./Column";

/** The board's columns are the statuses, so its filters leave Status to them. */
const BOARD_OMITS = ["status"] as const;

interface BoardViewProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onInlineEdit: (task: Task & { goalId?: string | null }) => void;
}

export function BoardView({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  onInlineEdit,
}: BoardViewProps) {
  // The list's pipeline: lenses, filters, search and list mode.
  const view = useVisibleTasks(tasks, BOARD_OMITS);
  const filteredTasks = view.visible;

  // Group tasks by status
  const columns = useMemo(() => {
    const grouped = Object.values(TaskStatus).reduce(
      (acc, status) => {
        acc[status] = filteredTasks.filter((task) => task.status === status);
        return acc;
      },
      {} as Record<TaskStatus, Task[]>
    );
    return grouped;
  }, [filteredTasks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;

    if (Object.values(TaskStatus).includes(newStatus)) {
      onStatusChange(taskId, newStatus);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <TaskListToolbar view={view} surface="board" />
      <div className="flex flex-1 snap-x snap-mandatory gap-3 overflow-auto p-3 md:snap-none md:gap-6 md:p-6">
        <DndContext onDragEnd={handleDragEnd}>
          {Object.values(TaskStatus).map((status) => (
            <Column
              key={status}
              status={status}
              tasks={columns[status]}
              onEdit={onEdit}
              onDelete={onDelete}
              onInlineEdit={onInlineEdit}
            />
          ))}
        </DndContext>
      </div>
    </div>
  );
}
