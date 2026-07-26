import { useEffect, useRef, useState } from "react";

// Import missing functions
import { isThisWeek, isThisYear, isToday, isTomorrow } from "date-fns";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { HiCheck, HiExclamation, HiX } from "react-icons/hi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createUTCMidnightDate,
  format,
  isFutureDate,
  newDate,
  newDateFromYMD,
} from "@/lib/date-utils";

import { useLordStore } from "@/store/lord";

import { EnergyLevel, Priority, Task, TimePreference } from "@/types/task";

import {
  energyLevelColors,
  formatEnumValue,
  priorityColors,
  timePreferenceColors,
} from "../utils/task-list-utils";

/** Renders as a quiet value (or —) until clicked, then becomes an editor —
 *  the Close/Notion table cell pattern. "lord" isn't a Task field: it reads
 *  from goalLinks and saves through the API's single-goal `goalId` setter. */
interface EditableCellProps {
  task: Task;
  field: keyof Task | "lord";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onSave: (task: Task & { goalId?: string | null }) => void;
}

const EMPTY = <span className="text-muted-foreground/50">—</span>;

export function EditableCell({
  task,
  field,
  value,
  onSave,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const editRef = useRef<HTMLDivElement>(null);
  const { lords } = useLordStore();

  const taskLord = lords.find((lord) =>
    task.goalLinks?.some((link) => lord.goalIds.includes(link.goalId))
  );

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          editRef.current &&
          !editRef.current.contains(event.target as Node) &&
          // Don't handle click-outside for dropdowns
          field !== "energyLevel" &&
          field !== "preferredTime" &&
          field !== "priority" &&
          field !== "lord"
        ) {
          setEditValue(value);
          setIsEditing(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isEditing, value, field]);

  const handleSave = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onSave({ ...task, [field]: editValue });
    setIsEditing(false);
  };

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditValue(value);
    setIsEditing(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel(e);
    }
  };

  if (!isEditing) {
    return (
      <div
        onClick={handleClick}
        className="-mx-1 min-w-0 cursor-pointer px-1 hover:bg-muted/50"
      >
        {field === "title" ? (
          <div className="task-title truncate text-sm font-medium text-foreground">
            {value}
          </div>
        ) : field === "energyLevel" ? (
          value ? (
            <span
              className={`px-2 py-0.5 text-xs ${energyLevelColors[value as EnergyLevel]}`}
            >
              {formatEnumValue(value)}
            </span>
          ) : (
            EMPTY
          )
        ) : field === "preferredTime" ? (
          value ? (
            <span
              className={`px-2 py-0.5 text-xs ${timePreferenceColors[value as TimePreference]}`}
            >
              {formatEnumValue(value)}
            </span>
          ) : (
            EMPTY
          )
        ) : field === "priority" ? (
          value ? (
            <span
              className={`px-2 py-0.5 text-xs ${priorityColors[value as Priority]}`}
            >
              {formatEnumValue(value)}
            </span>
          ) : (
            EMPTY
          )
        ) : field === "duration" ? (
          value ? (
            <span className="text-sm text-muted-foreground">{value}m</span>
          ) : (
            EMPTY
          )
        ) : field === "dueDate" ? (
          value ? (
            <span
              className={`flex items-center gap-1 text-sm ${
                formatContextualDate(newDate(value)).isOverdue
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              <span className="truncate">
                {formatContextualDate(newDate(value)).text}
              </span>
              {formatContextualDate(newDate(value)).isOverdue && (
                <HiExclamation className="h-4 w-4 flex-none text-destructive" />
              )}
            </span>
          ) : (
            EMPTY
          )
        ) : field === "startDate" ? (
          value ? (
            <span className="text-sm text-muted-foreground">
              {formatContextualDate(newDate(value)).text}
            </span>
          ) : (
            EMPTY
          )
        ) : field === "lord" ? (
          taskLord ? (
            <span className="block truncate text-sm text-foreground">
              {taskLord.title}
            </span>
          ) : task.goalLinks?.length ? (
            // Linked to a goal outside the active hex's lords — not
            // unassigned. Picking a lord here replaces that link.
            <span
              className="block truncate text-sm italic text-muted-foreground"
              title="Linked to a goal outside the current hex"
            >
              Other hex
            </span>
          ) : (
            EMPTY
          )
        ) : (
          value
        )}
      </div>
    );
  }

  return (
    <div
      ref={editRef}
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {field === "title" ? (
        <Input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="h-8"
          autoFocus
        />
      ) : field === "energyLevel" ? (
        <Select
          value={editValue || "none"}
          onValueChange={(value) => {
            onSave({
              ...task,
              [field]: value !== "none" ? (value as EnergyLevel) : null,
            });
            setIsEditing(false);
          }}
        >
          <SelectTrigger className="h-8 min-w-[140px]">
            <SelectValue placeholder="No Energy Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Energy Level</SelectItem>
            {Object.values(EnergyLevel).map((level) => (
              <SelectItem key={level} value={level}>
                {formatEnumValue(level)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field === "preferredTime" ? (
        <Select
          value={editValue || "none"}
          onValueChange={(value) => {
            onSave({
              ...task,
              [field]: value !== "none" ? (value as TimePreference) : null,
            });
            setIsEditing(false);
          }}
        >
          <SelectTrigger className="h-8 min-w-[140px]">
            <SelectValue placeholder="No Time Preference" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Time Preference</SelectItem>
            {Object.values(TimePreference).map((time) => (
              <SelectItem key={time} value={time}>
                {formatEnumValue(time)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field === "priority" ? (
        <Select
          value={editValue || "none"}
          onValueChange={(value) => {
            onSave({
              ...task,
              [field]: value !== "none" ? (value as Priority) : null,
            });
            setIsEditing(false);
          }}
        >
          <SelectTrigger className="h-8 min-w-[140px]">
            <SelectValue placeholder="No Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Priority</SelectItem>
            {Object.values(Priority).map((priority) => (
              <SelectItem key={priority} value={priority}>
                {formatEnumValue(priority)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field === "duration" ? (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={editValue || ""}
            onChange={(e) =>
              setEditValue(e.target.value ? parseInt(e.target.value) : null)
            }
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="h-8 w-20"
            placeholder="Minutes"
            min="1"
            autoFocus
          />
        </div>
      ) : field === "dueDate" ? (
        <div className="flex items-center gap-2">
          <DatePicker
            selected={
              editValue
                ? newDateFromYMD(
                    new Date(editValue).getUTCFullYear(),
                    new Date(editValue).getUTCMonth(),
                    new Date(editValue).getUTCDate()
                  )
                : null
            }
            onChange={(date) => {
              // Just update the local state, don't save yet
              setEditValue(date);
            }}
            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            dateFormat="MMM d, yyyy"
            isClearable
            autoFocus
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // Use the date-utils function to create a consistent UTC midnight date
              onSave({
                ...task,
                [field]: createUTCMidnightDate(editValue),
              });
              setIsEditing(false);
            }}
            className="h-8 w-8 p-0 text-green-600 hover:bg-green-500/10 hover:text-green-700"
          >
            <HiCheck className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <HiX className="h-4 w-4" />
          </Button>
        </div>
      ) : field === "startDate" ? (
        <div className="flex items-center gap-2">
          <DatePicker
            selected={
              editValue
                ? newDateFromYMD(
                    new Date(editValue).getUTCFullYear(),
                    new Date(editValue).getUTCMonth(),
                    new Date(editValue).getUTCDate()
                  )
                : null
            }
            onChange={(date) => {
              // Just update the local state, don't save yet
              setEditValue(date);
            }}
            className="h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            dateFormat="MMM d, yyyy"
            isClearable
            autoFocus
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // Use the date-utils function to create a consistent UTC midnight date
              onSave({
                ...task,
                [field]: createUTCMidnightDate(editValue),
              });
              setIsEditing(false);
            }}
            className="h-8 w-8 p-0 text-green-600 hover:bg-green-500/10 hover:text-green-700"
          >
            <HiCheck className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <HiX className="h-4 w-4" />
          </Button>
        </div>
      ) : field === "lord" ? (
        <Select
          value={taskLord?.id || "none"}
          onValueChange={(value) => {
            // The API's single-goal setter: replaces the task's goal links
            // with a link to the chosen Lord (null clears them).
            onSave({ ...task, goalId: value === "none" ? null : value });
            setIsEditing(false);
          }}
        >
          <SelectTrigger className="h-8 min-w-[140px]">
            <SelectValue>{taskLord?.title ?? "Unassigned"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {lords.map((lord) => (
              <SelectItem key={lord.id} value={lord.id}>
                {lord.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {field === "title" && (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSave}
            className="h-8 w-8 p-0 text-green-600 hover:bg-green-500/10 hover:text-green-700"
          >
            <HiCheck className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <HiX className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

// Helper functions
const formatContextualDate = (date: Date) => {
  // For UTC midnight dates (e.g. 2025-03-10T00:00:00.000Z),
  // just use the date components to create a local date
  const localDate = newDateFromYMD(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  const now = newDate();
  now.setHours(0, 0, 0, 0);

  const isOverdue = localDate < now && !isToday(localDate);
  const isFuture = isFutureDate(localDate);
  let text = "";
  if (isToday(localDate)) {
    text = "Today";
  } else if (isTomorrow(localDate)) {
    text = "Tomorrow";
  } else if (isThisWeek(localDate)) {
    text = format(localDate, "EEEE");
  } else if (isThisYear(localDate)) {
    text = format(localDate, "MMM d");
  } else {
    text = format(localDate, "MMM d, yyyy");
  }
  if (isOverdue) {
    text = `Overdue: ${text}`;
  }
  return { text, isOverdue, isFuture };
};
