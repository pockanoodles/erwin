"use client";

import { useEffect, useMemo, useState } from "react";

import { TaskPacketPane } from "@/components/packet/TaskPacket";
import { GradeBlock } from "@/components/packet/GradeBlock";

import { useResource } from "@/hooks/use-resource";
import { format, isToday, isYesterday } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { useCourseActivityStore } from "@/store/courseActivity";

import type { ActivityItem, ActivityKind, NewsItem } from "@/types/course-activity";
import type { LibraryCourse } from "@/types/course-materials";
import type { GradebookCourse } from "@/types/gradebook";

import { courseTab } from "./course-tab";
import { SEEN_DWELL_MS } from "./LibrarySheet";
import { MaterialPreview } from "./MaterialPreview";
import { NewsPreview } from "./NewsSheet";
import {
  BAND,
  FilterStrip,
  HEAD,
  ROW,
  SheetLayout,
  StripCount,
  StripToggle,
  Tag,
  UnseenPip,
  cellClass,
  gutterClass,
  sheetKeyHandler,
  titleCellClass,
  useScrollActiveIntoView,
} from "@/components/sheet/sheet";

/**
 * Activity: everything that changed in Canvas, newest first, a band per day —
 * announcements and inbox messages, new and replaced materials, new
 * assignments, moved due dates, grades, feedback, work gone missing. Unseen
 * rows carry a lume pip; opening a row reads it in the pane and clears it.
 */

const KIND: Record<ActivityKind, { tag: string; tone?: "danger"; label: string }> = {
  ANNOUNCEMENT: { tag: "News", label: "Announcement" },
  MESSAGE: { tag: "Inbox", label: "Inbox message" },
  MATERIAL_NEW: { tag: "Added", label: "New material" },
  MATERIAL_UPDATED: { tag: "Edited", label: "Material changed" },
  SYLLABUS_CHANGED: { tag: "Syll", label: "Syllabus edited" },
  ASSIGNMENT_NEW: { tag: "Task", label: "New assignment" },
  DUE_CHANGED: { tag: "Due", label: "Due date moved" },
  GRADE_POSTED: { tag: "Grade", label: "Grade posted" },
  GRADE_CHANGED: { tag: "Regrade", label: "Grade changed" },
  FEEDBACK: { tag: "Note", label: "Feedback" },
  MISSING: { tag: "Missing", tone: "danger", label: "Missing work" },
  CORRECTION_RETIRED: { tag: "Fixed", tone: "danger", label: "Canvas changed something you corrected" },
};

type Row = { type: "day"; key: string; label: string } | { type: "item"; key: string; item: ActivityItem };

function dayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE MMM d");
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  return isToday(d) ? format(d, "h:mm a") : format(d, "MMM d");
}

export function ActivitySheet({
  courses,
  courseKey,
  selected,
  onSelect,
}: {
  courses: LibraryCourse[];
  /** One course's id, or null for every course. */
  courseKey: string | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { items, unseenCount, loaded, error, load, markSeen } = useCourseActivityStore();
  const [unseenOnly, setUnseenOnly] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => items.filter((i) => (!courseKey || i.course.id === courseKey) && (!unseenOnly || !i.seenAt || i.id === selected)),
    [items, courseKey, unseenOnly, selected]
  );
  const rows = useMemo(() => {
    const out: Row[] = [];
    let day = "";
    for (const item of shown) {
      const label = dayLabel(new Date(item.occurredAt));
      if (label !== day) {
        day = label;
        out.push({ type: "day", key: `day:${label}`, label });
      }
      out.push({ type: "item", key: item.id, item });
    }
    return out;
  }, [shown]);

  const selectedIndex = selected ? rows.findIndex((r) => r.key === selected) : -1;
  const activeIndex = selectedIndex >= 0 ? selectedIndex : rows.findIndex((r) => r.type === "item");
  const active = activeIndex >= 0 && rows[activeIndex].type === "item" ? (rows[activeIndex] as Extract<Row, { type: "item" }>).item : null;
  const courseUnseen = courseKey ? shown.filter((i) => !i.seenAt).length : unseenCount;

  useScrollActiveIntoView([activeIndex, courseKey]);

  // Dwelling on a row you picked reads it — along with anything else about the
  // same thing. The row the sheet opens on by default isn't a choice, so it waits.
  useEffect(() => {
    if (!active || active.seenAt || selectedIndex < 0) return;
    const t = setTimeout(() => {
      const { materialId, announcementId, conversationId, assignmentId } = active.target;
      const target = materialId
        ? { materialId }
        : announcementId
          ? { announcementId }
          : conversationId
            ? { conversationId }
            : assignmentId
              ? { assignmentId }
              : { ids: [active.id] };
      void markSeen(target);
    }, SEEN_DWELL_MS);
    return () => clearTimeout(t);
  }, [active, selectedIndex, markSeen]);

  const onKeyDown = sheetKeyHandler({
    count: rows.length,
    active: activeIndex,
    isSelectable: (i) => rows[i].type === "item",
    select: (i) => onSelect(rows[i].key),
    open: () => {
      if (active?.target.htmlUrl) window.open(active.target.htmlUrl, "_blank", "noopener,noreferrer");
    },
  });

  return (
    <>
      <FilterStrip>
        <StripToggle pressed={unseenOnly} onClick={() => setUnseenOnly((v) => !v)} title="Hide what's already been seen">
          Unseen only
        </StripToggle>
        <StripCount>
          {courseUnseen} unseen · {shown.length} shown
        </StripCount>
        <button
          type="button"
          disabled={courseUnseen === 0}
          onClick={() => void markSeen(courseKey ? { all: true, courseId: courseKey } : { all: true })}
          className="er-slash ml-auto px-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-40"
        >
          Mark all seen
        </button>
      </FilterStrip>

      <SheetLayout
        label="Canvas activity"
        onKeyDown={(e) => void onKeyDown(e)}
        sheet={
          <table className="w-full min-w-[620px] table-fixed select-none border-separate border-spacing-0 text-[13px]">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: "36%" }} />
              <col />
              {!courseKey ? <col style={{ width: 76 }} /> : null}
              <col style={{ width: 76 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(ROW, HEAD, "left-0 z-30 text-right")}>#</th>
                <th scope="col" className={cn(ROW, HEAD)}>Kind</th>
                <th scope="col" className={cn(ROW, HEAD)}>Title</th>
                <th scope="col" className={cn(ROW, HEAD)}>What happened</th>
                {!courseKey ? <th scope="col" className={cn(ROW, HEAD)}>Course</th> : null}
                <th scope="col" className={cn(ROW, HEAD, "border-r-0")}>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[13px] text-muted-foreground">
                    {!loaded
                      ? "Loading activity…"
                      : error
                        ? error
                        : unseenOnly
                          ? "Nothing unseen. You're caught up."
                          : "Nothing has changed in Canvas since Erwin started watching."}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) =>
                  row.type === "day" ? (
                    <tr key={row.key}>
                      <td className={gutterClass(false)}>{i + 1}</td>
                      <td colSpan={courseKey ? 4 : 5} className={BAND}>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{row.label}</span>
                      </td>
                    </tr>
                  ) : (
                    <ActivityRow
                      key={row.key}
                      item={row.item}
                      number={i + 1}
                      active={i === activeIndex}
                      showCourse={!courseKey}
                      onSelect={() => onSelect(row.key)}
                    />
                  )
                )
              )}
            </tbody>
          </table>
        }
        pane={active ? <ActivityPreview key={active.id} item={active} courses={courses} /> : <EmptyPane />}
      />
    </>
  );
}

function ActivityRow({
  item,
  number,
  active,
  showCourse,
  onSelect,
}: {
  item: ActivityItem;
  number: number;
  active: boolean;
  showCourse: boolean;
  onSelect: () => void;
}) {
  const cell = cellClass(active);
  const kind = KIND[item.kind];
  const unseen = !item.seenAt;
  return (
    <tr data-active-row={active || undefined} onClick={onSelect} className="group cursor-cell">
      <td className={gutterClass(active)}>{number}</td>
      <td className={cell}>
        <Tag tone={kind.tone}>{kind.tag}</Tag>
      </td>
      <td className={cn(cell, titleCellClass(active), "text-foreground")} title={item.title}>
        <span className="flex items-center gap-1.5 truncate">
          {unseen ? <UnseenPip /> : null}
          <span className={cn("truncate", unseen && "font-medium")}>{item.title}</span>
        </span>
      </td>
      <td className={cn(cell, "text-muted-foreground")} title={item.detail ?? undefined}>
        {item.detail}
      </td>
      {showCourse ? (
        <td className={cn(cell, "font-mono text-[11px] text-muted-foreground")}>{courseTab(item.course)}</td>
      ) : null}
      <td className={cn(cell, "border-r-0 tabular-nums text-muted-foreground")}>{whenLabel(item.occurredAt)}</td>
    </tr>
  );
}

function EmptyPane() {
  return <p className="p-4 text-[13px] text-muted-foreground">Select a row to read it here.</p>;
}

/** What happened, in one line above whatever the row points at. */
function WhatHappened({ item }: { item: ActivityItem }) {
  const kind = KIND[item.kind];
  return (
    <div className="flex-none border-b border-border bg-muted/40 px-4 py-2 text-[13px]">
      <span className={cn("er-bracketed mr-2 font-mono text-[11px] uppercase tracking-[0.08em]", kind.tone === "danger" ? "text-destructive" : "text-muted-foreground")}>
        {kind.label}
      </span>
      {item.detail ? <span className="text-foreground">{item.detail}</span> : null}
      <span className="ml-2 text-muted-foreground">
        · {courseTab(item.course)} · {format(new Date(item.occurredAt), "EEE MMM d, p")}
      </span>
    </div>
  );
}

function findMaterial(courses: LibraryCourse[], id: string) {
  for (const course of courses) {
    for (const mod of course.modules) {
      const material = mod.materials.find((m) => m.id === id);
      if (material) return { course, material, moduleName: mod.name };
    }
    const material = course.unfiled.find((m) => m.id === id);
    if (material) return { course, material, moduleName: null };
  }
  return null;
}

function ActivityPreview({ item, courses }: { item: ActivityItem; courses: LibraryCourse[] }) {
  const { target } = item;
  const course = courses.find((c) => c.id === item.course.id) ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WhatHappened item={item} />
      <ActivityTarget item={item} course={course} courses={courses} />
      {!target.materialId && !target.announcementId && !target.conversationId && !target.assignmentId && target.htmlUrl ? (
        <a href={target.htmlUrl} target="_blank" rel="noopener noreferrer" className="p-4 text-[13px] underline underline-offset-4">
          Open in Canvas
        </a>
      ) : null}
    </div>
  );
}

function ActivityTarget({
  item,
  course,
  courses,
}: {
  item: ActivityItem;
  course: LibraryCourse | null;
  courses: LibraryCourse[];
}) {
  const { target } = item;
  if (item.kind === "SYLLABUS_CHANGED" && course) {
    return <MaterialPreview course={course} row={{ type: "syllabus", key: `syllabus:${course.id}` }} />;
  }
  if (target.materialId) {
    const found = findMaterial(courses, target.materialId);
    if (!found) return <Gone what="This material" />;
    return (
      <MaterialPreview
        course={found.course}
        row={{ type: "item", key: found.material.id, material: found.material, moduleName: found.moduleName }}
      />
    );
  }
  if (target.announcementId || target.conversationId) {
    return <NewsTarget courseId={item.course.id} id={(target.announcementId ?? target.conversationId)!} />;
  }
  if (target.taskId) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TaskPacketPane taskId={target.taskId} source="CANVAS" />
      </div>
    );
  }
  if (target.assignmentId) {
    return <GradebookTarget courseId={item.course.id} assignmentId={target.assignmentId} />;
  }
  return null;
}

function Gone({ what }: { what: string }) {
  return <p className="p-4 text-[13px] text-muted-foreground">{what} is no longer on Canvas.</p>;
}

function NewsTarget({ courseId, id }: { courseId: string; id: string }) {
  const { data, loading, error } = useResource<NewsItem[]>(`/api/erwin/news?courseId=${courseId}`);
  if (!data) return <p className="p-4 text-[13px] text-muted-foreground">{error ?? (loading ? "Loading…" : null)}</p>;
  const news = data.find((n) => n.id === id);
  return news ? <NewsPreview item={news} /> : <Gone what="This post" />;
}

function GradebookTarget({ courseId, assignmentId }: { courseId: string; assignmentId: string }) {
  const { data, loading, error } = useResource<GradebookCourse[]>(`/api/erwin/grades?courseId=${courseId}`);
  const a = data?.[0]?.assignments.find((x) => x.id === assignmentId);
  if (!data) return <p className="p-4 text-[13px] text-muted-foreground">{error ?? (loading ? "Loading…" : null)}</p>;
  if (!a) return <Gone what="This assignment" />;
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-foreground">{a.name}</h2>
      <GradeBlock data={a} />
    </div>
  );
}
