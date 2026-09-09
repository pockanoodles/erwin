"use client";

import { BsDiagram3, BsListTask } from "react-icons/bs";

import {
  BarSegmented,
  type BarSegment,
} from "@/components/navigation/top-bar-parts";

import { useGoalsPageSettings } from "@/store/goalsPageSettings";

/** The Bosses page's share of the app top bar — see CalendarTopBar for why
 *  these live with their feature rather than inside AppTopBar. */

type GoalsViewMode = "list" | "map";

const VIEW_SEGMENTS: ReadonlyArray<BarSegment<GoalsViewMode>> = [
  { id: "list", label: "List", icon: BsListTask },
  { id: "map", label: "Map", icon: BsDiagram3 },
];

export function GoalsTopBarViews() {
  const { viewMode, setViewMode } = useGoalsPageSettings();
  return (
    <BarSegmented
      label="Bosses view"
      segments={VIEW_SEGMENTS}
      value={viewMode}
      onChange={setViewMode}
    />
  );
}
