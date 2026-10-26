"use client";

import { HiOutlineUserAdd } from "react-icons/hi";

import {
  BarButton,
  type BarSegment,
  BarSegmented,
} from "@/components/navigation/top-bar-parts";

import { type PeopleView, usePeopleStore } from "@/modules/people/store";

const VIEWS: ReadonlyArray<BarSegment<PeopleView>> = [
  { id: "all", label: "All" },
  { id: "due", label: "Due" },
  { id: "archived", label: "Archived" },
];

/** People's views in the top bar: everyone, who's due within a week, the archived. */
export function PeopleTopBarViews() {
  const view = usePeopleStore((s) => s.view);
  const setView = usePeopleStore((s) => s.setView);
  return (
    <BarSegmented
      label="People view"
      segments={VIEWS}
      value={view}
      onChange={setView}
    />
  );
}

/** Add someone (the pane holds them until saved). Bracketed rather than
 *  rust: on this page the rust is logging a conversation, the thing to do
 *  now, and the empty page offers its own rust "Add person". */
export function PeopleTopBarActions() {
  const select = usePeopleStore((s) => s.select);
  const setView = usePeopleStore((s) => s.setView);
  const view = usePeopleStore((s) => s.view);
  return (
    <BarButton
      icon={HiOutlineUserAdd}
      onClick={() => {
        if (view === "archived") setView("all");
        select("new");
      }}
    >
      Add person
    </BarButton>
  );
}
