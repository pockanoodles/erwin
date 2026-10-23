"use client";

import { useEffect, useMemo, useState } from "react";

import { HiSearch } from "react-icons/hi";

import { kindLabel, openTarget, sizeLabel, statusLabel } from "@/components/packet/material-meta";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

import { useCourseActivityStore } from "@/store/courseActivity";

import type { LibraryCourse } from "@/types/course-materials";

import { courseTab } from "./course-tab";
import {
  type CourseRow,
  type LibraryRow,
  buildLibraryRows,
  isForOpenTask,
  isSelectable,
} from "./library-rows";
import { dueLabel, MaterialPreview } from "./MaterialPreview";
import {
  BAND,
  FilterStrip,
  HEAD,
  ROW,
  SheetLayout,
  StripCount,
  StripToggle,
  UnseenPip,
  cellClass,
  gutterClass,
  sheetKeyHandler,
  titleCellClass,
  useScrollActiveIntoView,
} from "./sheet";

/**
 * Library: every mirrored Canvas course as a sheet — Canvas's module order
 * down the rows, what each thing is and what it's for across the columns, and
 * a reading pane that shows the selected row. On the All tab, each course is a
 * band and search runs across all of them.
 */

/** How long a row has to stay selected before it counts as seen — arrowing past isn't reading. */
export const SEEN_DWELL_MS = 700;

function rowKeyOf(row: LibraryRow): string | null {
  if (row.type === "item") return row.material.id;
  if (row.type === "syllabus") return row.key;
  return null;
}

export function LibrarySheet({
  courses,
  selected,
  onSelect,
}: {
  courses: LibraryCourse[];
  /** A material id or a "syllabus:<course>" key. */
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [forOpenTasks, setForOpenTasks] = useState(false);
  const markSeen = useCourseActivityStore((s) => s.markSeen);
  const allCourses = courses.length > 1;

  const rows = useMemo(() => buildLibraryRows(courses, { search, forOpenTasks }), [courses, search, forOpenTasks]);
  const selectedIndex = selected ? rows.findIndex(({ row }) => rowKeyOf(row) === selected) : -1;
  // Filtering can hide the selection; fall back to the first row rather than an empty pane.
  const activeIndex = selectedIndex >= 0 ? selectedIndex : rows.findIndex(({ row }) => isSelectable(row));
  const active: CourseRow | null = activeIndex >= 0 ? rows[activeIndex] : null;

  useScrollActiveIntoView([activeIndex, courses]);

  // Reading a new or replaced material you picked is what clears it from Activity.
  const unseenMaterial =
    selectedIndex >= 0 && active?.row.type === "item" && active.row.material.unseen ? active.row.material.id : null;
  useEffect(() => {
    if (!unseenMaterial) return;
    const t = setTimeout(() => void markSeen({ materialId: unseenMaterial }), SEEN_DWELL_MS);
    return () => clearTimeout(t);
  }, [unseenMaterial, markSeen]);

  const onKeyDown = sheetKeyHandler({
    count: rows.length,
    active: activeIndex,
    isSelectable: (i) => isSelectable(rows[i].row),
    select: (i) => onSelect(rowKeyOf(rows[i].row)),
    open: () => {
      if (active?.row.type !== "item") return;
      const target = openTarget(active.row.material);
      if (target) window.open(target.href, "_blank", "noopener,noreferrer");
    },
  });

  // Links inside a page body that point at another mirrored page stay in the pane.
  const onPaneClick = (e: React.MouseEvent) => {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    const id = href?.startsWith("/courses?m=") ? href.slice("/courses?m=".length) : null;
    if (!id) return;
    e.preventDefault();
    setSearch("");
    setForOpenTasks(false);
    onSelect(id);
  };

  const itemCount = rows.filter(({ row }) => row.type === "item").length;
  const placeholder = allCourses ? "Search every course…" : `Search ${courseTab(courses[0])}…`;

  return (
    <>
      <FilterStrip>
        <div className="relative">
          <HiSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} className="h-8 w-56 pl-8" />
        </div>
        <StripToggle
          pressed={forOpenTasks}
          onClick={() => setForOpenTasks((v) => !v)}
          title="Only materials an open task links to, and open assignments"
        >
          For open tasks
        </StripToggle>
        <StripCount>
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </StripCount>
        {!allCourses ? (
          <span className="ml-auto hidden truncate px-1 text-[12px] text-muted-foreground lg:inline">
            {courses[0].name}
            {courses[0].termName ? ` · ${courses[0].termName}` : ""}
          </span>
        ) : null}
      </FilterStrip>

      <SheetLayout
        label={allCourses ? "All courses' materials" : `${courseTab(courses[0])} materials`}
        onKeyDown={(e) => void onKeyDown(e)}
        sheet={
          <table className="w-full min-w-[600px] table-fixed select-none border-separate border-spacing-0 text-[13px]">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 52 }} />
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 68 }} />
              <col style={{ width: 76 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(ROW, HEAD, "left-0 z-30 text-right")}>#</th>
                <th scope="col" className={cn(ROW, HEAD)}>Kind</th>
                <th scope="col" className={cn(ROW, HEAD)}>Title</th>
                <th scope="col" className={cn(ROW, HEAD)}>For</th>
                <th scope="col" className={cn(ROW, HEAD)}>Due</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")}>Size</th>
                <th scope="col" className={cn(ROW, HEAD, "border-r-0")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-[13px] text-muted-foreground">
                    {forOpenTasks ? "No open task links to materials here." : "Nothing matches."}
                  </td>
                </tr>
              ) : (
                rows.map(({ row }, i) => (
                  <LibrarySheetRow
                    key={row.key}
                    row={row}
                    number={i + 1}
                    active={i === activeIndex}
                    onSelect={() => isSelectable(row) && onSelect(rowKeyOf(row))}
                  />
                ))
              )}
            </tbody>
          </table>
        }
        pane={
          <div className="flex min-h-0 flex-1 flex-col" onClick={onPaneClick}>
            <MaterialPreview
              key={active?.row.key ?? "none"}
              course={active?.course ?? courses[0]}
              row={active?.row ?? null}
            />
          </div>
        }
      />
    </>
  );
}

function LibrarySheetRow({
  row,
  number,
  active,
  onSelect,
}: {
  row: LibraryRow;
  number: number;
  active: boolean;
  onSelect: () => void;
}) {
  const gutter = gutterClass(active);
  const cell = cellClass(active);

  if (row.type === "course") {
    return (
      <tr>
        <td className={gutter}>{number}</td>
        <td colSpan={6} className={cn(BAND, "bg-muted")}>
          <span className="flex items-center gap-3 truncate">
            <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-foreground">
              {courseTab(row.course)}
            </span>
            <span className="truncate text-[12px] text-muted-foreground">{row.course.name}</span>
          </span>
        </td>
      </tr>
    );
  }

  // Band / subheader titles stay in the Title column even when Kind is blank —
  // spanning Kind made empty-kind rows look like they bled left under the header.
  if (row.type === "module") {
    return (
      <tr>
        <td className={gutter}>{number}</td>
        <td className={cn(cell, "bg-muted/50")} aria-hidden>
          {" "}
        </td>
        <td colSpan={5} className={BAND}>
          <span className="flex items-center gap-3 truncate">
            <span className="truncate text-[12px] font-medium text-foreground">{row.name}</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{row.count}</span>
            {row.unlockAt && new Date(row.unlockAt) > new Date() ? (
              <span className="text-[12px] text-muted-foreground">
                unlocks {new Date(row.unlockAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            ) : null}
          </span>
        </td>
      </tr>
    );
  }

  if (row.type === "subheader") {
    return (
      <tr>
        <td className={gutter}>{number}</td>
        <td className={cell} aria-hidden>
          {" "}
        </td>
        <td colSpan={5} className={cn(ROW, "border-b border-border/60 px-2 align-middle")}>
          <span className="block truncate text-[12px] italic text-muted-foreground" style={{ paddingLeft: row.indent * 12 }}>
            {row.title}
          </span>
        </td>
      </tr>
    );
  }

  if (row.type === "syllabus") {
    return (
      <tr data-active-row={active || undefined} onClick={onSelect} className="cursor-cell">
        <td className={gutter}>{number}</td>
        <td className={cn(cell, "font-mono text-[10px] uppercase tracking-wide text-muted-foreground")}>SYL</td>
        <td className={cn(cell, "text-foreground", active && "outline outline-2 -outline-offset-2 outline-rust")}>Syllabus</td>
        <td className={cell} />
        <td className={cell} />
        <td className={cell} />
        <td className={cn(cell, "border-r-0")} />
      </tr>
    );
  }

  const m = row.material;
  const status = statusLabel(m);
  const forText =
    m.task != null
      ? m.task.status === "completed"
        ? "Done"
        : "This task"
      : m.nextTask
        ? `${m.nextTask.title}${m.openTaskCount > 1 ? ` +${m.openTaskCount - 1}` : ""}`
        : null;

  return (
    <tr data-active-row={active || undefined} onClick={onSelect} className="group cursor-cell">
      <td className={gutter}>{number}</td>
      <td className={cn(cell, "font-mono text-[10px] uppercase tracking-wide text-muted-foreground")}>
        {kindLabel(m) || " "}
      </td>
      <td
        className={cn(cell, titleCellClass(active), m.locked ? "text-muted-foreground" : "text-foreground")}
        title={m.title}
      >
        <span className="flex items-center gap-1.5 truncate" style={{ paddingLeft: m.indent * 12 }}>
          {m.unseen ? <UnseenPip /> : null}
          <span className={cn("truncate", m.unseen && "font-medium")}>{m.title}</span>
        </span>
      </td>
      <td className={cn(cell, "text-muted-foreground")} title={forText ?? undefined}>
        {forText}
      </td>
      <td className={cn(cell, "tabular-nums text-muted-foreground")}>{dueLabel(m)}</td>
      <td className={cn(cell, "text-right tabular-nums text-muted-foreground")}>
        {m.kind === "FILE" ? sizeLabel(m.sizeBytes) : null}
      </td>
      <td className={cn(cell, "border-r-0 text-muted-foreground")}>{status}</td>
    </tr>
  );
}

/** Materials and open assignments an open task needs, for a course's tab badge. */
export function openCount(course: LibraryCourse): number {
  return [...course.modules.flatMap((m) => m.materials), ...course.unfiled].filter(isForOpenTask).length;
}
