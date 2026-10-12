"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HiSearch } from "react-icons/hi";

import { kindLabel, openTarget, sizeLabel, statusLabel } from "@/components/packet/material-meta";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

import { useCourseLibraryStore } from "@/store/courseLibrary";

import type { LibraryCourse } from "@/types/course-materials";

import {
  buildRows,
  firstSelectable,
  indexOfMaterial,
  isForOpenTask,
  isSelectable,
  stepSelectable,
  type LibraryRow,
} from "./library-rows";
import { dueLabel, MaterialPreview } from "./MaterialPreview";

/**
 * /courses — every mirrored Canvas course as one sheet per course: Canvas's
 * module order down the rows, what each thing is and what it's for across the
 * columns, and a reading pane that shows the selected row. Same grammar as
 * the Tasks sheet (26px ruled rows, numbered gutter, sheet tabs along the
 * bottom) so the two read as one tool.
 */

const ROW = "h-[26px]";
const HEAD =
  "sticky top-0 z-20 border-b border-r border-border bg-muted px-2 text-left font-mono text-[10px] font-normal uppercase tracking-wide text-muted-foreground";

/** Canvas course names carry section and term noise; the code is what's on the tab. */
function courseTab(c: LibraryCourse): string {
  const code = c.code ?? c.name;
  return code.match(/^[A-Z]{2,5}\s?\d{4}/)?.[0].replace(/\s/, "") ?? code.slice(0, 16);
}

function readInitialMaterial(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("m");
}

export function CourseLibrary() {
  const { courses, loaded, error, fetchCourses } = useCourseLibraryStore();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [forOpenTasks, setForOpenTasks] = useState(false);
  const [pendingMaterial, setPendingMaterial] = useState<string | null>(readInitialMaterial);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchCourses();
  }, [fetchCourses]);

  // A deep link (?m=<material>) picks its course and row once the tree lands.
  useEffect(() => {
    if (!loaded || courses.length === 0) return;
    if (pendingMaterial) {
      const owner = courses.find((c) =>
        [...c.modules.flatMap((m) => m.materials), ...c.unfiled].some((m) => m.id === pendingMaterial)
      );
      if (owner) {
        setCourseId(owner.id);
        setSelected(pendingMaterial);
      }
      setPendingMaterial(null);
      return;
    }
    if (!courseId || !courses.some((c) => c.id === courseId)) setCourseId(courses[0].id);
  }, [loaded, courses, courseId, pendingMaterial]);

  const course = courses.find((c) => c.id === courseId) ?? null;
  const rows = useMemo(
    () => (course ? buildRows(course, { search, forOpenTasks }) : []),
    [course, search, forOpenTasks]
  );

  const selectedIndex = useMemo(() => {
    if (!selected) return -1;
    if (selected.startsWith("syllabus:")) return rows.findIndex((r) => r.key === selected);
    return indexOfMaterial(rows, selected);
  }, [rows, selected]);

  // Filtering can hide the selection; fall back to the first row rather than an empty pane.
  const activeIndex = selectedIndex >= 0 ? selectedIndex : firstSelectable(rows);
  const activeRow: LibraryRow | null = activeIndex >= 0 ? rows[activeIndex] : null;

  const select = useCallback((row: LibraryRow) => {
    setSelected(row.type === "item" ? row.material.id : row.key);
    if (row.type === "item") {
      window.history.replaceState(null, "", `/courses?m=${row.material.id}`);
    } else {
      window.history.replaceState(null, "", "/courses");
    }
  }, []);

  useEffect(() => {
    sheetRef.current
      ?.querySelector("[data-active-row]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, courseId]);

  const switchCourse = (id: string) => {
    setCourseId(id);
    setSelected(null);
    window.history.replaceState(null, "", "/courses");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const go = (i: number) => {
      e.preventDefault();
      if (i >= 0 && rows[i]) select(rows[i]);
    };
    switch (e.key) {
      case "ArrowDown":
      case "j":
        return go(stepSelectable(rows, activeIndex, 1));
      case "ArrowUp":
      case "k":
        return go(stepSelectable(rows, activeIndex, -1));
      case "Home":
        return go(firstSelectable(rows));
      case "End":
        return go(stepSelectable(rows, rows.length, -1));
      case "Enter":
      case "o": {
        if (activeRow?.type !== "item") return;
        const target = openTarget(activeRow.material);
        if (!target) return;
        e.preventDefault();
        window.open(target.href, "_blank", "noopener,noreferrer");
        return;
      }
      case "[":
      case "]": {
        const i = courses.findIndex((c) => c.id === courseId);
        const next = courses[(i + (e.key === "]" ? 1 : -1) + courses.length) % courses.length];
        if (next) {
          e.preventDefault();
          switchCourse(next.id);
        }
        return;
      }
    }
  };

  // Links inside a page body that point at another mirrored page stay in the pane.
  const onPreviewClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    const id = href?.startsWith("/courses?m=") ? href.slice("/courses?m=".length) : null;
    if (!id) return;
    const owner = courses.find((c) =>
      [...c.modules.flatMap((m) => m.materials), ...c.unfiled].some((m) => m.id === id)
    );
    if (!owner) return;
    e.preventDefault();
    if (owner.id !== courseId) setCourseId(owner.id);
    setSearch("");
    setForOpenTasks(false);
    setSelected(id);
    window.history.replaceState(null, "", href);
  };

  if (!loaded) {
    return <p className="p-6 text-[13px] text-muted-foreground">Loading courses…</p>;
  }
  if (error) {
    return <p className="p-6 text-[13px] text-destructive">{error}</p>;
  }
  if (courses.length === 0 || !course) {
    return (
      <div className="p-6 text-[14px] text-muted-foreground">
        <p>No courses mirrored yet.</p>
        <p className="mt-1">Connect Canvas in Settings, then press Sync Canvas above.</p>
      </div>
    );
  }

  const itemCount = rows.filter((r) => r.type === "item").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filter strip — same shape as the Tasks sheet's. */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        <div className="relative">
          <HiSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${courseTab(course)}…`}
            className="h-8 w-56 pl-8"
          />
        </div>
        <button
          type="button"
          aria-pressed={forOpenTasks}
          onClick={() => setForOpenTasks((v) => !v)}
          title="Only materials an open task links to, and open assignments"
          className={cn(
            "flex h-8 flex-none items-center border border-border px-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150",
            forOpenTasks ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          )}
        >
          For open tasks
        </button>
        <span className="px-1 font-mono text-xs text-muted-foreground">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
        <span className="ml-auto hidden truncate px-1 text-[12px] text-muted-foreground lg:inline">
          {course.name}
          {course.termName ? ` · ${course.termName}` : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          ref={sheetRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-label={`${courseTab(course)} materials`}
          className="min-h-0 min-w-0 flex-1 overflow-auto outline-none"
        >
          <table className="w-full min-w-[720px] table-fixed select-none border-separate border-spacing-0 text-[13px]">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 52 }} />
              <col />
              <col style={{ width: 200 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 88 }} />
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
                    {forOpenTasks ? "No open task in this course links to materials." : "Nothing matches."}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <LibrarySheetRow
                    key={row.key}
                    row={row}
                    number={i + 1}
                    active={i === activeIndex}
                    onSelect={() => isSelectable(row) && select(row)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <section
          aria-label="Reading pane"
          onClick={onPreviewClick}
          className="flex h-1/2 min-h-0 flex-none flex-col border-t border-border md:h-auto md:w-[46%] md:max-w-[720px] md:border-l md:border-t-0"
        >
          <MaterialPreview key={activeRow?.key ?? "none"} course={course} row={activeRow} />
        </section>
      </div>

      {/* Sheet tabs: one per course. */}
      <div className="flex flex-none items-stretch overflow-x-auto border-t border-border bg-background">
        {courses.map((c) => {
          const open = [...c.modules.flatMap((m) => m.materials), ...c.unfiled].filter(isForOpenTask).length;
          const selectedTab = c.id === courseId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => switchCourse(c.id)}
              title={c.name}
              className={cn(
                "flex h-9 flex-none items-center gap-1.5 whitespace-nowrap border-r border-border px-3 text-sm transition-colors duration-150",
                selectedTab
                  ? "bg-foreground font-medium text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span>{courseTab(c)}</span>
              {open > 0 ? (
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    selectedTab ? "text-background/80" : "text-muted-foreground"
                  )}
                  title={`${open} materials and assignments for open tasks`}
                >
                  {open}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
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
  const gutter = cn(
    ROW,
    "sticky left-0 z-10 border-b border-r border-border px-2 text-right font-mono text-[10px] tabular-nums",
    active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
  );
  const cell = cn(
    ROW,
    "max-w-0 truncate border-b border-r border-border/60 px-2 align-middle",
    active && "bg-rust/5"
  );

  if (row.type === "module") {
    return (
      <tr>
        <td className={gutter}>{number}</td>
        <td colSpan={6} className={cn(ROW, "border-b border-border bg-muted/50 px-2 align-middle")}>
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
        <td className={cell} />
        <td colSpan={5} className={cn(ROW, "border-b border-border/60 px-2 align-middle")}>
          <span
            className="block truncate text-[12px] italic text-muted-foreground"
            style={{ paddingLeft: row.indent * 12 }}
          >
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
        <td className={cn(cell, "text-foreground", active && "outline outline-2 -outline-offset-2 outline-rust")}>
          Syllabus
        </td>
        <td className={cell} />
        <td className={cell} />
        <td className={cell} />
        <td className={cn(cell, "border-r-0")} />
      </tr>
    );
  }

  const m = row.material;
  const status = statusLabel(m);
  const isTaskRow = m.task != null;
  const forText = isTaskRow
    ? m.task?.status === "completed"
      ? "Done"
      : "This task"
    : m.nextTask
      ? `${m.nextTask.title}${m.openTaskCount > 1 ? ` +${m.openTaskCount - 1}` : ""}`
      : null;

  return (
    <tr data-active-row={active || undefined} onClick={onSelect} className="group cursor-cell">
      <td className={gutter}>{number}</td>
      <td className={cn(cell, "font-mono text-[10px] uppercase tracking-wide text-muted-foreground")}>
        {kindLabel(m)}
      </td>
      <td
        className={cn(
          cell,
          active ? "outline outline-2 -outline-offset-2 outline-rust" : "group-hover:bg-muted/40",
          m.locked ? "text-muted-foreground" : "text-foreground"
        )}
        title={m.title}
      >
        <span className="block truncate" style={{ paddingLeft: m.indent * 12 }}>
          {m.title}
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
