"use client";

import { BarButton } from "@/components/navigation/top-bar-parts";

import { formatDistanceToNow } from "@/lib/date-utils";

import { useCourseLibraryStore } from "@/store/courseLibrary";

/** The Courses page's share of the app top bar: when Canvas was last mirrored, and a way to do it now. */
export function CoursesTopBarActions() {
  const { courses, syncing, lastSyncError, sync } = useCourseLibraryStore();

  const last = courses
    .map((c) => (c.lastSyncedAt ? new Date(c.lastSyncedAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  return (
    <>
      <span className="hidden text-[12px] tabular-nums text-muted-foreground md:inline">
        {lastSyncError
          ? `Sync failed: ${lastSyncError}`
          : syncing
            ? "Syncing Canvas — a few minutes…"
            : last
              ? `Mirrored ${formatDistanceToNow(new Date(last), { addSuffix: true })}`
              : null}
      </span>
      <BarButton
        onClick={() => void sync()}
        title="Fetch every course's modules, pages and files from Canvas now"
        aria-disabled={syncing || undefined}
      >
        {syncing ? "Syncing…" : "Sync Canvas"}
      </BarButton>
    </>
  );
}
