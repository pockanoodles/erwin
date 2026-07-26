import { useMemo } from "react";

import { HiOutlineViewBoards, HiPlus, HiSearch, HiX } from "react-icons/hi";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { newDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { filterTasksByLord, useLordStore } from "@/store/lord";
import {
  TaskColumnId,
  useTaskListViewSettings,
} from "@/store/taskListViewSettings";

import { EnergyLevel, Task, TaskStatus, TimePreference } from "@/types/task";

import { SortableHeader, TaskRow } from "./components";
import {
  compareTaskEnergyLevel,
  compareTaskPriority,
  formatEnumValue,
  taskMatchesListFilters,
} from "./utils/task-list-utils";

interface TaskListProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onInlineEdit: (task: Task) => void;
}

type SortKey = ReturnType<typeof useTaskListViewSettings.getState>["sortBy"];

/** Column registry: order here is render order. Title is always visible. */
const COLUMNS: {
  id: TaskColumnId;
  label: string;
  sortKey: SortKey;
  width?: string;
}[] = [
  { id: "status", label: "Status", sortKey: "status", width: "w-28" },
  { id: "title", label: "Title", sortKey: "title" },
  { id: "priority", label: "Priority", sortKey: "priority", width: "w-24" },
  { id: "energyLevel", label: "Energy", sortKey: "energyLevel", width: "w-24" },
  {
    id: "preferredTime",
    label: "Time",
    sortKey: "preferredTime",
    width: "w-24",
  },
  { id: "dueDate", label: "Due date", sortKey: "dueDate", width: "w-28" },
  { id: "duration", label: "Duration", sortKey: "duration", width: "w-20" },
  { id: "lord", label: "Lord", sortKey: "lord", width: "w-40" },
  { id: "schedule", label: "Schedule", sortKey: "schedule", width: "w-44" },
  {
    id: "startDate",
    label: "Start date",
    sortKey: "startDate",
    width: "w-28",
  },
];

export function TaskList({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  onInlineEdit,
}: TaskListProps) {
  const {
    sortBy,
    sortDirection,
    status,
    energyLevel,
    timePreference,
    tagIds,
    search,
    hideUpcomingTasks,
    visibleColumns,
    setSortBy,
    setSortDirection,
    setFilters,
    toggleColumn,
  } = useTaskListViewSettings();
  const { lords, activeLordId } = useLordStore();

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

  // Tasks fight for goals; a task's Lord is the root whose subtree holds any
  // of its linked goals. Used by the Lord column sort.
  const lordTitleOf = (task: Task) =>
    lords.find((lord) =>
      task.goalLinks?.some((link) => lord.goalIds.includes(link.goalId))
    )?.title;

  // First, scope to the selected Lord's section (its whole path in the DAG)
  const lordFilteredTasks = filterTasksByLord(tasks, lords, activeLordId);

  // Then apply other filters (single source of truth in task-list-utils so the
  // "Hide upcoming tasks" filter stays consistent with the "Upcoming" badge).
  const filteredTasks = useMemo(() => {
    return lordFilteredTasks.filter((task) =>
      taskMatchesListFilters(task, {
        status,
        energyLevel,
        timePreference,
        tagIds,
        search,
        hideUpcomingTasks,
      })
    );
  }, [
    lordFilteredTasks,
    status,
    energyLevel,
    timePreference,
    tagIds,
    search,
    hideUpcomingTasks,
  ]);

  // Apply sorting
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
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
        case "lord":
        case "project": {
          // "project" is the legacy persisted name for this sort key
          const aLord = lordTitleOf(a);
          const bLord = lordTitleOf(b);
          if (!aLord) return 1;
          if (!bLord) return -1;
          return direction * aLord.localeCompare(bLord);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTasks, sortBy, sortDirection, lords]);

  const toggleValue = <T,>(current: T[] | undefined, value: T): T[] | undefined => {
    const next = current?.includes(value)
      ? current.filter((v) => v !== value)
      : [...(current ?? []), value];
    return next.length > 0 ? next : undefined;
  };

  const filterChip = (label: string, value: string, onClear: () => void) => (
    <span className="flex h-8 flex-none items-center gap-2 border border-border px-2 font-mono text-xs">
      <span className="uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="max-w-48 truncate text-foreground">{value}</span>
      <button
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <HiX className="h-3 w-3" />
      </button>
    </span>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-8 flex-none items-center gap-1.5 border border-dashed border-border px-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground">
              <HiPlus className="h-3.5 w-3.5" />
              Add filter
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {Object.values(TaskStatus).map((s) => (
                    <DropdownMenuCheckboxItem
                      key={s}
                      checked={status?.includes(s) ?? false}
                      onCheckedChange={() =>
                        setFilters({ status: toggleValue(status, s) })
                      }
                    >
                      {formatEnumValue(s)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Energy</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {Object.values(EnergyLevel).map((level) => (
                    <DropdownMenuCheckboxItem
                      key={level}
                      checked={energyLevel?.includes(level) ?? false}
                      onCheckedChange={() =>
                        setFilters({
                          energyLevel: toggleValue(energyLevel, level),
                        })
                      }
                    >
                      {formatEnumValue(level)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Time</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {Object.values(TimePreference).map((time) => (
                    <DropdownMenuCheckboxItem
                      key={time}
                      checked={timePreference?.includes(time) ?? false}
                      onCheckedChange={() =>
                        setFilters({
                          timePreference: toggleValue(timePreference, time),
                        })
                      }
                    >
                      {formatEnumValue(time)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={hideUpcomingTasks ?? false}
              onCheckedChange={(checked) =>
                setFilters({ hideUpcomingTasks: checked as boolean })
              }
            >
              Hide upcoming tasks
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {status?.length
          ? filterChip(
              "Status",
              status.map(formatEnumValue).join(", "),
              () => setFilters({ status: undefined })
            )
          : null}
        {energyLevel?.length
          ? filterChip(
              "Energy",
              energyLevel.map(formatEnumValue).join(", "),
              () => setFilters({ energyLevel: undefined })
            )
          : null}
        {timePreference?.length
          ? filterChip(
              "Time",
              timePreference.map(formatEnumValue).join(", "),
              () => setFilters({ timePreference: undefined })
            )
          : null}
        {hideUpcomingTasks
          ? filterChip("Hiding", "Upcoming", () =>
              setFilters({ hideUpcomingTasks: false })
            )
          : null}

        <span className="px-1 font-mono text-xs text-muted-foreground">
          {sortedTasks.length} task{sortedTasks.length === 1 ? "" : "s"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <HiSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search || ""}
              onChange={(e) =>
                setFilters({ search: e.target.value || undefined })
              }
              placeholder="Search tasks..."
              className="h-8 w-56 pl-8"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-8 flex-none items-center gap-1.5 border border-border px-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground">
                <HiOutlineViewBoards className="h-3.5 w-3.5" />
                Columns
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={visible.has(col.id)}
                  disabled={col.id === "title"}
                  onCheckedChange={() => toggleColumn(col.id)}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border bg-background">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed divide-y divide-border">
            <thead className="sticky top-0 z-10 border-b border-border bg-background">
              <tr>
                <th scope="col" className="w-8 px-2 py-2">
                  {/* Drag handle column */}
                </th>
                {COLUMNS.filter((col) => visible.has(col.id)).map((col) => (
                  <SortableHeader
                    key={col.id}
                    column={col.sortKey === "project" ? "lord" : col.sortKey}
                    label={col.label}
                    currentSort={sortBy === "project" ? "lord" : sortBy}
                    direction={sortDirection}
                    onSort={handleSort}
                    className={cn(col.width)}
                  />
                ))}
                <th scope="col" className="relative w-28 px-2 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {sortedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  visibleColumns={visible}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onStatusChange={onStatusChange}
                  onInlineEdit={onInlineEdit}
                />
              ))}
            </tbody>
          </table>
          {sortedTasks.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No tasks found. Try adjusting your filters or create a new task.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
