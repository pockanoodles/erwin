import { useMemo } from "react";

import { newDate } from "@/lib/date-utils";

import { useIsMobile } from "@/hooks/use-media-query";

import {
  TaskColumnId,
  useTaskListViewSettings,
} from "@/store/taskListViewSettings";
import { useTaskPageSettings } from "@/store/taskPageSettings";

import { Task, TaskStatus } from "@/types/task";

import { TaskListToolbar } from "./TaskListToolbar";
import { TaskRow } from "./TaskRow";
import { TaskRowExpansionProvider } from "./TaskRow/TaskRowExpansionContext";
import { TaskSheet } from "./datasheet/TaskSheet";
import { TASK_COLUMNS, type TaskPatch } from "./datasheet/columns";
import { useVisibleTasks } from "./filters/use-visible-tasks";
import { withLensColumns } from "./lens";
import { useTasksLenses } from "./use-tasks-lenses";
import {
  compareTaskEnergyLevel,
  compareTaskPriority,
  emptyListModeMessage,
  groupTasksForListMode,
} from "./utils/task-list-utils";

interface TaskListProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onInlineEdit: (task: TaskPatch) => void;
  onCreateSubtask: (parentId: string, title: string) => Promise<void>;
}

type SortKey = ReturnType<typeof useTaskListViewSettings.getState>["sortBy"];

/** A module column's sort: empty values last whichever way it runs. */
function compareSortValues(
  a: string | number | null,
  b: string | number | null,
  direction: number
): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return typeof a === "string" && typeof b === "string"
    ? direction * a.localeCompare(b)
    : direction * (Number(a) - Number(b));
}

export function TaskList({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  onInlineEdit,
  onCreateSubtask,
}: TaskListProps) {
  const isMobile = useIsMobile();
  const {
    sortBy,
    sortDirection,
    listMode,
    visibleColumns,
    setSortBy,
    setSortDirection,
    packetOpen,
  } = useTaskListViewSettings();
  const { listStyle } = useTaskPageSettings();
  // The sheet's columns, the modules' included (Courses: Mat, Ladder: Goal);
  // a module column sorts by its own value.
  const lenses = useTasksLenses();
  const columns = useMemo(
    () => withLensColumns(TASK_COLUMNS, lenses),
    [lenses]
  );

  const visible = useMemo(
    () => new Set<TaskColumnId>([...visibleColumns, "title"]),
    [visibleColumns]
  );

  const handleSort = (column: SortKey) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDirection("desc");
    }
  };

  // Parents only, through the lenses and the filters; children nest under
  // their parent. The board runs the same pipeline.
  const view = useVisibleTasks(tasks);
  const { childrenOf } = view;

  // Apply sorting
  const sortedTasks = useMemo(() => {
    // A module's column sorts by its own value.
    const moduleSort = columns.find((c) => c.sortKey === sortBy)?.sortValue;
    return [...view.visible].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (moduleSort) {
        return compareSortValues(moduleSort(a), moduleSort(b), direction);
      }
      switch (sortBy) {
        case "title":
          return direction * a.title.localeCompare(b.title);
        case "dueDate":
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return (
            direction *
            (newDate(a.dueDate).getTime() - newDate(b.dueDate).getTime())
          );
        case "startDate":
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return (
            direction *
            (newDate(a.startDate).getTime() - newDate(b.startDate).getTime())
          );
        case "status":
          return direction * a.status.localeCompare(b.status);
        case "priority":
          // Sort by semantic rank (low < medium < high, no-priority last), not
          // the alphabetical order of the labels. See task-list-utils.
          return compareTaskPriority(a, b, direction);
        case "energyLevel":
          // Sort by semantic rank (low < medium < high), not alphabetically.
          return compareTaskEnergyLevel(a, b, direction);
        case "preferredTime":
          if (!a.preferredTime) return 1;
          if (!b.preferredTime) return -1;
          return direction * a.preferredTime.localeCompare(b.preferredTime);
        case "duration":
          if (!a.duration) return 1;
          if (!b.duration) return -1;
          return direction * (a.duration - b.duration);
        case "schedule":
          // First sort by auto-scheduled vs manual
          if (a.isAutoScheduled !== b.isAutoScheduled) {
            return direction * (a.isAutoScheduled ? -1 : 1);
          }
          // Then sort by scheduled start time
          if (a.isAutoScheduled && b.isAutoScheduled) {
            if (!a.scheduledStart) return 1;
            if (!b.scheduledStart) return -1;
            return (
              direction *
              (newDate(a.scheduledStart).getTime() -
                newDate(b.scheduledStart).getTime())
            );
          }
          // Default to creation date for manual tasks
          return (
            direction *
            (newDate(b.createdAt).getTime() - newDate(a.createdAt).getTime())
          );
        default:
          return (
            direction *
            (newDate(b.createdAt).getTime() - newDate(a.createdAt).getTime())
          );
      }
    });
  }, [view.visible, sortBy, sortDirection, columns]);

  const groupedTasks = useMemo(
    () => groupTasksForListMode(sortedTasks, listMode),
    [sortedTasks, listMode]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TaskListToolbar view={view} surface="list" />

      {isMobile || listStyle === "rows" ? (
        sortedTasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">
              {emptyListModeMessage(listMode)}
            </p>
          </div>
        ) : (
          <TaskRowExpansionProvider>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {groupedTasks.map((group) => (
                <section key={group.key}>
                  {group.label ? (
                    <h2 className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.0875em] text-muted-foreground">
                      {group.label}
                      <span>{group.tasks.length}</span>
                    </h2>
                  ) : null}
                  <ul>
                    {group.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        subtasks={childrenOf[task.id] ?? []}
                        onPatch={onInlineEdit}
                        onOpenModal={onEdit}
                        onDelete={onDelete}
                        onStatusChange={onStatusChange}
                        onCreateSubtask={onCreateSubtask}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </TaskRowExpansionProvider>
        )
      ) : (
        <TaskSheet
          tasks={sortedTasks}
          visibleColumns={visible}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          onInlineEdit={onInlineEdit}
          packetOpen={packetOpen}
        />
      )}
    </div>
  );
}
