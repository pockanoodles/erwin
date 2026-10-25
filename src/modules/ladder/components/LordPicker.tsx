"use client";

import { HiFlag, HiOutlineFlag } from "react-icons/hi";

import { ToolbarButton } from "@/components/tasks/TaskRow/ToolbarButton";
import type { TaskControlProps } from "@/components/tasks/lens";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";

import { useLordStore } from "@/store/lord";

/**
 * Ladder's control on a task (its Tasks lens): which Lord the task serves.
 * In an expanded row's toolbar it's a dropdown button; on a board card it's
 * a quiet chip that opens a select. Picking one pins the task to it.
 */
export function LordPicker({ task, onPatch, variant }: TaskControlProps) {
  const lords = useLordStore((s) => s.lords);
  const taskLord = lords.find((lord) =>
    task.goalLinks?.some((link) => lord.goalIds.includes(link.goalId))
  );
  const choose = (goalId: string | null) => onPatch({ ...task, goalId });

  if (variant === "toolbar") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarButton
            active={Boolean(taskLord)}
            aria-label="Lord"
            title="Assign Lord"
          >
            <HiOutlineFlag className="h-4 w-4" />
            <span className="hidden max-w-36 truncate sm:inline">
              {taskLord ? taskLord.title : "Lord"}
            </span>
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="rounded-none">
          <DropdownMenuItem onSelect={() => choose(null)}>
            Unassigned
          </DropdownMenuItem>
          {lords.map((lord) => (
            <DropdownMenuItem key={lord.id} onSelect={() => choose(lord.id)}>
              {lord.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Select
      value={taskLord?.id || "none"}
      onValueChange={(value) => choose(value === "none" ? null : value)}
    >
      <SelectTrigger
        className={cn(
          "h-auto gap-1 border-none bg-transparent p-0 text-xs shadow-none transition-colors duration-150 focus:ring-0",
          taskLord
            ? "text-muted-foreground hover:text-foreground"
            : "text-muted-foreground/50 hover:text-foreground"
        )}
        title="Assign Lord"
      >
        <span className="flex items-center gap-1">
          <HiFlag className="h-3 w-3 flex-none" />
          {taskLord
            ? taskLord.title
            : task.goalLinks?.length
              ? "Other hex"
              : "No lord"}
        </span>
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
  );
}
