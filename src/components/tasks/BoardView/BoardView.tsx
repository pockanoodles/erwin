"use client";

import { useMemo } from "react";

import { DndContext, DragEndEvent } from "@dnd-kit/core";

import { filterTasksByLord, useLordStore } from "@/store/lord";
import { useTaskListViewSettings } from "@/store/taskListViewSettings";

import { Task, TaskStatus } from "@/types/task";

import { Column } from "./Column";

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
  const { lords, activeLordId } = useLordStore();
  const { energyLevel, timePreference, tagIds, search } =
    useTaskListViewSettings();

  // First, scope to the selected Lord's section (its whole path in the DAG)
  const lordFilteredTasks = filterTasksByLord(tasks, lords, activeLordId);

  // Then apply other filters
  const filteredTasks = useMemo(() => {
    return lordFilteredTasks.filter((task) => {
      // Energy level filter
      if (
        energyLevel?.length &&
        (!task.energyLevel || !energyLevel.includes(task.energyLevel))
      ) {
        return false;
      }

      // Time preference filter
      if (
        timePreference?.length &&
        (!task.preferredTime || !timePreference.includes(task.preferredTime))
      ) {
        return false;
      }

      // Tags filter
      if (tagIds?.length) {
        const taskTagIds = task.tags.map((t) => t.id);
        if (!tagIds.some((id) => taskTagIds.includes(id))) {
          return false;
        }
      }

      // Search
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          task.title.toLowerCase().includes(searchLower) ||
          task.description?.toLowerCase().includes(searchLower) ||
          task.tags.some((tag) => tag.name.toLowerCase().includes(searchLower))
        );
      }

      return true;
    });
  }, [lordFilteredTasks, energyLevel, timePreference, tagIds, search]);

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
      <div className="flex flex-1 gap-6 overflow-auto">
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
