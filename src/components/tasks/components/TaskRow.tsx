import {
  HiCheck,
  HiClock,
  HiCloud,
  HiLockClosed,
  HiMenuAlt4,
  HiPencil,
  HiRefresh,
  HiTrash,
} from "react-icons/hi";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import { format, newDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { TaskColumnId } from "@/store/taskListViewSettings";

import { Task, TaskStatus } from "@/types/task";

import { useDraggableTask } from "../../dnd/useDragAndDrop";
import {
  formatEnumValue,
  isUpcomingTask,
  statusColors,
} from "../utils/task-list-utils";
import { EditableCell } from "./EditableCell";

interface TaskRowProps {
  task: Task;
  visibleColumns: Set<TaskColumnId>;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onInlineEdit: (task: Task) => void;
}

/** One uniform-height row: values truncate instead of wrapping, empty cells
 *  stay quiet, and the drag handle + actions only surface on hover. */
export function TaskRow({
  task,
  visibleColumns,
  onEdit,
  onDelete,
  onStatusChange,
  onInlineEdit,
}: TaskRowProps) {
  const { draggableProps, isDragging } = useDraggableTask(task);
  const isFutureTask = isUpcomingTask(task);
  const isCompleted = task.status === TaskStatus.COMPLETED;

  return (
    <tr
      key={task.id}
      className={cn(
        "group h-11 transition-colors hover:bg-muted/50",
        isDragging ? "opacity-50" : "",
        isFutureTask ? "bg-muted/25 text-muted-foreground" : ""
      )}
    >
      <td className="px-2">
        <div
          className="cursor-grab text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-hover:opacity-100"
          {...draggableProps}
          onClick={(e) => e.stopPropagation()}
        >
          <HiMenuAlt4 className="h-4 w-4" />
        </div>
      </td>
      {visibleColumns.has("status") && (
        <td className="whitespace-nowrap px-3">
          <Select
            value={task.status}
            onValueChange={(value) => {
              onStatusChange(task.id, value as TaskStatus);
            }}
            onOpenChange={(open) => {
              if (open) {
                // Prevent opening the task modal when clicking the select
                document.body.classList.add("status-select-open");
              } else {
                // Remove the class after a short delay to allow the click event to be processed
                setTimeout(() => {
                  document.body.classList.remove("status-select-open");
                }, 100);
              }
            }}
          >
            <SelectTrigger
              className="h-8 border-none bg-transparent p-0 shadow-none hover:bg-transparent focus:ring-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                className={cn(
                  "px-2 py-0.5 text-xs font-medium",
                  statusColors[task.status]
                )}
              >
                {formatEnumValue(task.status)}
              </span>
            </SelectTrigger>
            <SelectContent>
              {Object.values(TaskStatus).map((status) => (
                <SelectItem key={status} value={status}>
                  <span
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium",
                      statusColors[status]
                    )}
                  >
                    {formatEnumValue(status)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      )}
      <td className="max-w-0 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <EditableCell
              task={task}
              field="title"
              value={task.title}
              onSave={onInlineEdit}
            />
          </div>

          {task.tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex flex-none items-center px-1.5 py-0.5 text-xs"
              style={{
                backgroundColor: `${tag.color}20` || "var(--muted)",
                color: tag.color || "var(--muted-foreground)",
              }}
            >
              {tag.name}
            </span>
          ))}
          {task.tags.length > 2 && (
            <span className="flex-none text-xs text-muted-foreground">
              +{task.tags.length - 2}
            </span>
          )}

          {isFutureTask && (
            <span className="flex-none bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              Upcoming
            </span>
          )}

          {task.isRecurring && (
            <HiRefresh
              className="h-4 w-4 flex-none text-blue-500"
              title="Recurring task"
            />
          )}
          {task.scheduleLocked && (
            <HiLockClosed
              className="h-4 w-4 flex-none text-amber-500"
              title="Schedule locked"
            />
          )}
          {task.externalTaskId && (
            <HiCloud
              className="h-4 w-4 flex-none text-sky-500"
              title={`Synced from ${task.source}`}
            />
          )}
        </div>
      </td>
      {visibleColumns.has("priority") && (
        <td className="whitespace-nowrap px-3">
          <EditableCell
            task={task}
            field="priority"
            value={task.priority}
            onSave={onInlineEdit}
          />
        </td>
      )}
      {visibleColumns.has("energyLevel") && (
        <td className="whitespace-nowrap px-3">
          <EditableCell
            task={task}
            field="energyLevel"
            value={task.energyLevel}
            onSave={onInlineEdit}
          />
        </td>
      )}
      {visibleColumns.has("preferredTime") && (
        <td className="whitespace-nowrap px-3">
          <EditableCell
            task={task}
            field="preferredTime"
            value={task.preferredTime}
            onSave={onInlineEdit}
          />
        </td>
      )}
      {visibleColumns.has("dueDate") && (
        <td className="whitespace-nowrap px-3 text-sm text-muted-foreground">
          <EditableCell
            task={task}
            field="dueDate"
            value={task.dueDate}
            onSave={onInlineEdit}
          />
        </td>
      )}
      {visibleColumns.has("duration") && (
        <td className="whitespace-nowrap px-3 text-sm text-muted-foreground">
          <EditableCell
            task={task}
            field="duration"
            value={task.duration}
            onSave={onInlineEdit}
          />
        </td>
      )}
      {visibleColumns.has("lord") && (
        <td className="max-w-0 px-3">
          <EditableCell
            task={task}
            field="lord"
            value={task.goalLinks}
            onSave={onInlineEdit}
          />
        </td>
      )}
      {visibleColumns.has("schedule") && (
        <td className="whitespace-nowrap px-3">
          {task.isAutoScheduled ? (
            <span
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
              title={
                task.scheduleScore
                  ? `Auto-scheduled · score ${Math.round(task.scheduleScore * 100)}%`
                  : "Auto-scheduled"
              }
            >
              <HiClock className="h-3.5 w-3.5 flex-none text-cobalt" />
              {task.scheduledStart && task.scheduledEnd ? (
                <span className="truncate">
                  {format(newDate(task.scheduledStart), "MMM d, p")}–
                  {format(newDate(task.scheduledEnd), "p")}
                </span>
              ) : (
                "Auto"
              )}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground/50">Manual</span>
          )}
        </td>
      )}
      {visibleColumns.has("startDate") && (
        <td className="whitespace-nowrap px-3 text-sm text-muted-foreground">
          <EditableCell
            task={task}
            field="startDate"
            value={task.startDate}
            onSave={onInlineEdit}
          />
        </td>
      )}
      <td className="whitespace-nowrap px-2 text-right text-sm font-medium">
        <div
          className={cn(
            "flex items-center justify-end transition-opacity duration-150",
            isCompleted
              ? ""
              : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
          )}
        >
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-1",
              isCompleted
                ? "bg-green-500/20 text-green-700 hover:bg-green-500/30 dark:text-green-400"
                : "text-muted-foreground hover:bg-muted hover:text-green-600"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(
                task.id,
                isCompleted ? TaskStatus.TODO : TaskStatus.COMPLETED
              );
            }}
            title={isCompleted ? "Mark as todo" : "Mark as completed"}
          >
            <HiCheck className="h-5 w-5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-1 text-muted-foreground hover:bg-muted hover:text-primary",
              isCompleted &&
                "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            title="Edit task"
          >
            <HiPencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-1 text-muted-foreground hover:bg-muted hover:text-destructive",
              isCompleted &&
                "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            title="Delete task"
          >
            <HiTrash className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
