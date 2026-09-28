import { useMemo } from "react";

import {
  HiOutlineDocumentText,
  HiOutlineViewBoards,
  HiPlus,
  HiSearch,
  HiX,
} from "react-icons/hi";

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

import { useIsMobile } from "@/hooks/use-media-query";

import { filterTasksByLord, useLordStore } from "@/store/lord";
import { useMaterialCountsStore } from "@/store/materialCounts";
import {
  TaskColumnId,
  useTaskListViewSettings,
} from "@/store/taskListViewSettings";
import { useTaskPageSettings } from "@/store/taskPageSettings";

import { EnergyLevel, Task, TaskStatus, TimePreference } from "@/types/task";

import { TaskListModeSwitch } from "./TaskListModeSwitch";
import { TaskRow } from "./TaskRow";
import { TaskRowExpansionProvider } from "./TaskRow/TaskRowExpansionContext";
import { TaskSheet } from "./datasheet/TaskSheet";
import { TASK_COLUMNS, type TaskPatch } from "./datasheet/columns";
import {
  compareTaskEnergyLevel,
  compareTaskPriority,
  emptyListModeMessage,
  formatEnumValue,
  groupTasksByParent,
  groupTasksForListMode,
  parentMatchesListFilters,
  taskMatchesListMode,
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
    status,
    energyLevel,
    timePreference,
    tagIds,
    search,
    hideUpcomingTasks,
    showDeferred,
    listMode,
    visibleColumns,
    setSortBy,
    setSortDirection,
    setFilters,
    toggleColumn,
    packetOpen,
    setPacketOpen,
  } = useTaskListViewSettings();
  const { listStyle, setListStyle } = useTaskPageSettings();
  const { lords, activeLordId } = useLordStore();
  const materialCounts = useMaterialCountsStore((s) => s.counts);

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

  // Split children out of the inventory: only parents sort/filter as rows.
  // Children nest under their parent and inherit its Lord filter.
  const { parents, childrenOf } = useMemo(
    () => groupTasksByParent(tasks),
    [tasks]
  );

  const lordParents = useMemo(
    () => filterTasksByLord(parents, lords, activeLordId),
    [parents, lords, activeLordId]
  );

  // Then apply other filters (single source of truth in task-list-utils, so
  // the "Hide upcoming tasks" filter and the sheet's row tint agree on what
  // "upcoming" means — the old per-row "Upcoming" badge is gone). Search
  // still surfaces a parent when a child title matches.
  const filteredTasks = useMemo(() => {
    return lordParents.filter((task) =>
      parentMatchesListFilters(task, childrenOf[task.id] ?? [], {
        status,
        energyLevel,
        timePreference,
        tagIds,
        search,
        hideUpcomingTasks,
        showDeferred,
      })
    );
  }, [
    lordParents,
    childrenOf,
    status,
    energyLevel,
    timePreference,
    tagIds,
    search,
    hideUpcomingTasks,
    showDeferred,
  ]);

  const modeFilteredTasks = useMemo(() => {
    if (listMode === "all") return filteredTasks;
    return filteredTasks.filter((task) => taskMatchesListMode(task, listMode));
  }, [filteredTasks, listMode]);

  // Apply sorting
  const sortedTasks = useMemo(() => {
    return [...modeFilteredTasks].sort((a, b) => {
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
        case "materials": {
          const aCount = materialCounts[a.id]?.total ?? 0;
          const bCount = materialCounts[b.id]?.total ?? 0;
          if (!aCount) return 1;
          if (!bCount) return -1;
          return direction * (aCount - bCount);
        }
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
  }, [modeFilteredTasks, sortBy, sortDirection, lords, materialCounts]);

  const groupedTasks = useMemo(
    () => groupTasksForListMode(sortedTasks, listMode),
    [sortedTasks, listMode]
  );

  const toggleValue = <T,>(
    current: T[] | undefined,
    value: T
  ): T[] | undefined => {
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
    <div className="flex h-full min-h-0 flex-col">
      {/* Filter strip. Kept on the page rather than promoted into the app top
          bar: the bar holds what's true everywhere, and a filter is a property
          of this sheet. Sized to match the bar's controls so the two rows read
          as one stack. */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        <TaskListModeSwitch />
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
            <DropdownMenuCheckboxItem
              checked={showDeferred ?? false}
              onCheckedChange={(checked) =>
                setFilters({ showDeferred: checked as boolean })
              }
            >
              Show deferred
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {status?.length
          ? filterChip("Status", status.map(formatEnumValue).join(", "), () =>
              setFilters({ status: undefined })
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
        {showDeferred
          ? filterChip("Showing", "Deferred", () =>
              setFilters({ showDeferred: false })
            )
          : null}

        <span className="px-1 font-mono text-xs text-muted-foreground">
          {sortedTasks.length} task{sortedTasks.length === 1 ? "" : "s"}
        </span>

        <div className="ml-auto flex flex-1 items-center gap-2 md:flex-none">
          <div className="relative flex-1 md:flex-none">
            <HiSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search || ""}
              onChange={(e) =>
                setFilters({ search: e.target.value || undefined })
              }
              placeholder="Search tasks..."
              className="h-8 w-full pl-8 md:w-56"
            />
          </div>
          {!isMobile && (
            <div className="flex h-8 border border-border">
              <button
                type="button"
                onClick={() => setListStyle("rows")}
                className={cn(
                  "px-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
                  listStyle === "rows"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Rows
              </button>
              <button
                type="button"
                onClick={() => setListStyle("sheet")}
                className={cn(
                  "px-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
                  listStyle === "sheet"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sheet
              </button>
            </div>
          )}
          {!isMobile && listStyle === "sheet" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 flex-none items-center gap-1.5 border border-border px-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground">
                  <HiOutlineViewBoards className="h-3.5 w-3.5" />
                  Columns
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {TASK_COLUMNS.map((col) => (
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
          )}
          {!isMobile && listStyle === "sheet" && (
            <button
              type="button"
              aria-pressed={packetOpen}
              onClick={() => setPacketOpen(!packetOpen)}
              title="Show the selected Canvas task's instructions, rubric and materials"
              className={cn(
                "flex h-8 flex-none items-center gap-1.5 border border-border px-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
                packetOpen
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <HiOutlineDocumentText className="h-3.5 w-3.5" />
              Packet
            </button>
          )}
        </div>
      </div>

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
          // "project" is the legacy persisted name for the Lord sort key.
          sortBy={sortBy === "project" ? "lord" : sortBy}
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
