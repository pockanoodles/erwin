"use client";

import { BarButton, BarSegmented, type BarSegment } from "@/components/navigation/top-bar-parts";

import { formatDistanceToNow } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { useCourseActivityStore } from "@/store/courseActivity";
import { type CoursesView, useCourseLibraryStore } from "@/store/courseLibrary";

const VIEW_SEGMENTS: ReadonlyArray<BarSegment<CoursesView>> = [
  { id: "activity", label: "Activity" },
  { id: "grades", label: "Grades" },
  { id: "news", label: "News" },
  { id: "library", label: "Library" },
];

/** The Courses page's views: what changed, how it's going, what was said, what to read. */
export function CoursesTopBarViews() {
  const view = useCourseLibraryStore((s) => s.view);
  const setView = useCourseLibraryStore((s) => s.setView);
  return <BarSegmented label="Courses view" segments={VIEW_SEGMENTS} value={view} onChange={setView} />;
}

/** The Courses page's share of the app top bar: when Canvas was last mirrored, and a way to do it now. */
export function CoursesTopBarActions() {
  const { courses, syncing, lastSyncError, canvasSync, sync } = useCourseLibraryStore();
  const loadActivity = useCourseActivityStore((s) => s.load);

  const last =
    (canvasSync?.lastSyncedAt ? new Date(canvasSync.lastSyncedAt).getTime() : 0) ||
    courses.map((c) => (c.lastSyncedAt ? new Date(c.lastSyncedAt).getTime() : 0)).reduce((a, b) => Math.max(a, b), 0);
  // A background failure is the one that matters: an expired token once
  // stopped every sync for days without a word.
  const failure = lastSyncError ?? canvasSync?.error ?? null;

  return (
    <>
      <span
        className={cn("hidden max-w-[28rem] truncate text-[12px] tabular-nums md:inline", failure ? "text-destructive" : "text-muted-foreground")}
        title={failure ?? undefined}
      >
        {syncing
          ? "Syncing Canvas — a few minutes…"
          : failure
            ? `Canvas sync failed: ${failure}`
            : last
              ? `Synced ${formatDistanceToNow(new Date(last), { addSuffix: true })}`
              : null}
      </span>
      <BarButton
        onClick={async () => {
          await sync();
          void loadActivity({ force: true });
        }}
        title="Fetch grades, announcements, inbox, modules, pages and files from Canvas now — it also runs every 15 minutes"
        aria-disabled={syncing || undefined}
      >
        {syncing ? "Syncing…" : "Sync Canvas"}
      </BarButton>
    </>
  );
}
