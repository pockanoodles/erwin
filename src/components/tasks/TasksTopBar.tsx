"use client";

import { BsKanban, BsListTask } from "react-icons/bs";

import {
  BarButton,
  BarSegmented,
  type BarSegment,
} from "@/components/navigation/top-bar-parts";

import { useIsMobile } from "@/hooks/use-media-query";

import { UNASSIGNED_LORD_ID, useLordStore } from "@/store/lord";
import { useTaskStore } from "@/store/task";
import { useTaskModalStore } from "@/store/taskModal";
import { useTaskPageSettings } from "@/store/taskPageSettings";

/** The tasks page's share of the app top bar — see CalendarTopBar for why
 *  these live with their feature rather than inside AppTopBar. */

type TaskViewMode = "list" | "board";

const VIEW_SEGMENTS: ReadonlyArray<BarSegment<TaskViewMode>> = [
  { id: "list", label: "List", icon: BsListTask },
  { id: "board", label: "Board", icon: BsKanban },
];

export function TasksTopBarViews() {
  const { viewMode, setViewMode } = useTaskPageSettings();
  return (
    <BarSegmented
      label="Task view"
      segments={VIEW_SEGMENTS}
      value={viewMode}
      onChange={setViewMode}
    />
  );
}

export function TasksTopBarActions() {
  const scheduleAllTasks = useTaskStore((s) => s.scheduleAllTasks);
  const activeLordId = useLordStore((s) => s.activeLordId);
  const openCreate = useTaskModalStore((s) => s.openCreate);
  const isMobile = useIsMobile();

  return (
    <>
      {/* A bulk re-slot of every task is a desk action, and at 393px these two
          buttons squeezed the page title and the List/Board switch off the bar
          entirely. Still reachable from ⌘K. */}
      {!isMobile && (
        <BarButton onClick={() => scheduleAllTasks()}>Auto Schedule</BarButton>
      )}
      <BarButton
        emphasis="loud"
        data-create-task-button=""
        onClick={() =>
          // Creating inside a Lord's section pre-links the task to that Lord;
          // "All" and "Unassigned" seed nothing.
          openCreate(
            activeLordId && activeLordId !== UNASSIGNED_LORD_ID
              ? activeLordId
              : undefined
          )
        }
      >
        Create Task
      </BarButton>
    </>
  );
}
