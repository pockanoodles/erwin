"use client";

import {
  BarButton,
  type BarSegment,
  BarSegmented,
} from "@/components/navigation/top-bar-parts";

import { type TrainingView, useTrainingStore } from "@/modules/training/store";

const VIEWS: ReadonlyArray<BarSegment<TrainingView>> = [
  { id: "routines", label: "Routines" },
  { id: "history", label: "History" },
  { id: "archived", label: "Archived" },
];

/** Training's views in the top bar: the routines, every session, the archived. */
export function TrainingTopBarViews() {
  const view = useTrainingStore((s) => s.view);
  const setView = useTrainingStore((s) => s.setView);
  return (
    <BarSegmented
      label="Training view"
      segments={VIEWS}
      value={view}
      onChange={setView}
    />
  );
}

/** Add a routine (the pane holds it until saved). Bracketed rather than
 *  rust: on this page the rust is logging a session, the thing to do now. */
export function TrainingTopBarActions() {
  const select = useTrainingStore((s) => s.select);
  const setView = useTrainingStore((s) => s.setView);
  const view = useTrainingStore((s) => s.view);
  return (
    <BarButton
      onClick={() => {
        if (view !== "routines") setView("routines");
        select("new");
      }}
    >
      Add routine
    </BarButton>
  );
}
