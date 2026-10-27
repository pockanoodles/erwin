"use client";

import { HiOutlinePlus } from "react-icons/hi";

import {
  BarButton,
  type BarSegment,
  BarSegmented,
} from "@/components/navigation/top-bar-parts";

import { type WorkView, useWorkStore } from "@/modules/work/store";

const VIEWS: ReadonlyArray<BarSegment<WorkView>> = [
  { id: "shifts", label: "Shifts" },
  { id: "hours", label: "Hours" },
  { id: "contacts", label: "Contacts" },
  { id: "jobs", label: "Jobs" },
];

/** Work's views in the top bar: the shifts, each pay period's hours, the
 *  people to call, the jobs themselves. */
export function WorkTopBarViews() {
  const view = useWorkStore((s) => s.view);
  const setView = useWorkStore((s) => s.setView);
  return (
    <BarSegmented
      label="Work view"
      segments={VIEWS}
      value={view}
      onChange={setView}
    />
  );
}

/** Add a shift by hand (the pane holds it until saved); with no job yet,
 *  add the job first, in the same place. Bracketed rather than rust: on this
 *  page the rust is submitting a period's hours, the thing to do now. */
export function WorkTopBarActions() {
  const open = useWorkStore((s) => s.open);
  const noJob = useWorkStore(
    (s) => s.status === "ready" && s.jobs.length === 0
  );
  return noJob ? (
    <BarButton icon={HiOutlinePlus} onClick={() => open("jobs", "new")}>
      Add job
    </BarButton>
  ) : (
    <BarButton icon={HiOutlinePlus} onClick={() => open("shifts", "new")}>
      Add shift
    </BarButton>
  );
}
