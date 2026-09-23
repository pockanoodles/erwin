"use client";

import { useEffect } from "react";

import { BarSegmented } from "@/components/navigation/top-bar-parts";
import {
  parseTaskListMode,
  type TaskListMode,
} from "@/components/tasks/utils/task-list-utils";

import { useTaskListViewSettings } from "@/store/taskListViewSettings";

const MODE_SEGMENTS: ReadonlyArray<{ id: TaskListMode; label: string }> = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "someday", label: "Someday" },
];

/**
 * Query-mode switcher for `/tasks`. Writes `?mode=` (omitted for All) and
 * persists the last choice. Cmdk entries for these views are not wired —
 * confirm before adding.
 */
export function TaskListModeSwitch() {
  const listMode = useTaskListViewSettings((state) => state.listMode);
  const setListMode = useTaskListViewSettings((state) => state.setListMode);

  useEffect(() => {
    const parsed = parseTaskListMode(
      new URLSearchParams(window.location.search).get("mode")
    );
    if (parsed && parsed !== useTaskListViewSettings.getState().listMode) {
      setListMode(parsed);
    }
  }, [setListMode]);

  const onChange = (mode: TaskListMode) => {
    setListMode(mode);
    const url = new URL(window.location.href);
    if (mode === "all") {
      url.searchParams.delete("mode");
    } else {
      url.searchParams.set("mode", mode);
    }
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash
    );
  };

  return (
    <BarSegmented
      label="Task list mode"
      segments={MODE_SEGMENTS}
      value={listMode}
      onChange={onChange}
    />
  );
}
