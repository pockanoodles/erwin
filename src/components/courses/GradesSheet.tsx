"use client";

import { useEffect, useMemo } from "react";

import { GradeBlock, STATE_LABEL, percentOf, scoreText } from "@/components/packet/GradeBlock";
import { TaskPacketBody } from "@/components/packet/TaskPacket";

import { useResource } from "@/hooks/use-resource";
import { format, isThisYear } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { useCourseActivityStore } from "@/store/courseActivity";

import type { GradebookAssignment, GradebookCourse } from "@/types/gradebook";

import { courseTab } from "./course-tab";
import { SEEN_DWELL_MS } from "./LibrarySheet";
import {
  BAND,
  FilterStrip,
  HEAD,
  ROW,
  SheetLayout,
  StripCount,
  Tag,
  UnseenPip,
  cellClass,
  gutterClass,
  sheetKeyHandler,
  titleCellClass,
  useScrollActiveIntoView,
} from "@/components/sheet/sheet";

/**
 * Grades: Canvas's gradebook, mirrored. The All tab is the summary sheet —
 * one row per course with Canvas's total (or Erwin's estimate where Canvas
 * hides it); a course tab lists every assignment under its group, with the
 * score, the class mean and any feedback, and the pane shows how it went.
 */

const pct = (v: number | null) => (v == null ? null : `${(Math.round(v * 10) / 10).toFixed(1)}%`);

/** "Oct 24" this year; "Dec 2023" otherwise — instructors leave stale dates on copied assignments. */
function shortDate(d: Date): string {
  return isThisYear(d) ? format(d, "MMM d") : format(d, "MMM yyyy");
}

/** "99.6% A", or Erwin's estimate marked as such. */
export function courseTotal(c: GradebookCourse): { text: string; estimated: boolean } | null {
  if (c.currentScore != null) return { text: `${pct(c.currentScore)}${c.currentGrade ? ` ${c.currentGrade}` : ""}`, estimated: false };
  if (c.estimate != null) return { text: `${pct(c.estimate)}${c.estimateLetter ? ` ${c.estimateLetter}` : ""}`, estimated: true };
  return null;
}

function stateTag(a: GradebookAssignment) {
  const s = STATE_LABEL[a.state] ?? { word: a.state };
  if (a.state === "graded" && a.late) return <Tag tone="warn">Late</Tag>;
  return <Tag tone={s.tone}>{s.word}</Tag>;
}

export function GradesSheet({
  courseKey,
  selected,
  onSelect,
  onOpenCourse,
}: {
  /** One course's id, or null for the summary of every course. */
  courseKey: string | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** The summary's way into a course's own sheet. */
  onOpenCourse: (courseId: string) => void;
}) {
  const { data, loading, error } = useResource<GradebookCourse[]>(
    courseKey ? `/api/erwin/grades?courseId=${courseKey}` : "/api/erwin/grades"
  );
  if (!data) {
    return (
      <>
        <FilterStrip>
          <StripCount>{error ?? (loading ? "Loading grades…" : "")}</StripCount>
        </FilterStrip>
        <div className="flex-1" />
      </>
    );
  }
  return courseKey && data[0] ? (
    <CourseGrades course={data[0]} selected={selected} onSelect={onSelect} />
  ) : (
    <GradeSummary courses={data} selected={selected} onSelect={onSelect} onOpenCourse={onOpenCourse} />
  );
}

function GradeSummary({
  courses,
  selected,
  onSelect,
  onOpenCourse,
}: {
  courses: GradebookCourse[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpenCourse: (courseId: string) => void;
}) {
  const selectedIndex = selected ? courses.findIndex((c) => c.id === selected) : -1;
  const activeIndex = selectedIndex >= 0 ? selectedIndex : courses.length ? 0 : -1;
  const active = activeIndex >= 0 ? courses[activeIndex] : null;
  useScrollActiveIntoView([activeIndex]);

  const onKeyDown = sheetKeyHandler({
    count: courses.length,
    active: activeIndex,
    isSelectable: () => true,
    select: (i) => onSelect(courses[i].id),
    open: () => active && onOpenCourse(active.id),
  });

  return (
    <>
      <FilterStrip>
        <StripCount>
          {courses.length} course{courses.length === 1 ? "" : "s"} · Canvas&apos;s totals, or Erwin&apos;s estimate where a course hides them
        </StripCount>
      </FilterStrip>
      <SheetLayout
        label="Grades by course"
        onKeyDown={(e) => void onKeyDown(e)}
        sheet={
          <table className="w-full min-w-[600px] table-fixed select-none border-separate border-spacing-0 text-[13px]">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 88 }} />
              <col />
              <col style={{ width: 92 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 64 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(ROW, HEAD, "left-0 z-30 text-right")}>#</th>
                <th scope="col" className={cn(ROW, HEAD)}>Course</th>
                <th scope="col" className={cn(ROW, HEAD)}>Title</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")}>Current</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")} title="Ungraded work counted as zero">Final</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")}>Graded</th>
                <th scope="col" className={cn(ROW, HEAD, "border-r-0 text-right")}>Missing</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c, i) => {
                const isActive = i === activeIndex;
                const cell = cellClass(isActive);
                const total = courseTotal(c);
                const graded = c.assignments.filter((a) => a.state === "graded" && a.score != null).length;
                const counted = c.assignments.filter((a) => (a.pointsPossible ?? 0) > 0 && !a.omitFromFinalGrade).length;
                const missing = c.assignments.filter((a) => a.state === "missing" || a.state === "missed").length;
                const unseen = c.assignments.some((a) => a.unseen);
                return (
                  <tr key={c.id} data-active-row={isActive || undefined} onClick={() => onSelect(c.id)} onDoubleClick={() => onOpenCourse(c.id)} className="group cursor-cell">
                    <td className={gutterClass(isActive)}>{i + 1}</td>
                    <td className={cn(cell, "font-mono text-[11px] text-foreground")}>
                      <span className="flex items-center gap-1.5">
                        {unseen ? <UnseenPip /> : null}
                        {courseTab(c)}
                      </span>
                    </td>
                    <td className={cn(cell, titleCellClass(isActive), "text-muted-foreground")} title={c.name}>
                      {c.name}
                    </td>
                    <td className={cn(cell, "text-right tabular-nums", total?.estimated ? "text-muted-foreground" : "text-foreground")} title={total?.estimated ? "Canvas hides this course's total; Erwin's estimate from your scores" : undefined}>
                      {total ? `${total.estimated ? "≈ " : ""}${total.text}` : "—"}
                    </td>
                    <td className={cn(cell, "text-right tabular-nums text-muted-foreground")}>{pct(c.finalScore) ?? "—"}</td>
                    <td className={cn(cell, "text-right tabular-nums text-muted-foreground")}>
                      {graded}/{counted}
                    </td>
                    <td className={cn(cell, "border-r-0 text-right tabular-nums", missing ? "text-destructive" : "text-muted-foreground")}>{missing || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
        pane={active ? <CourseBreakdown key={active.id} course={active} onOpenCourse={onOpenCourse} /> : null}
      />
    </>
  );
}

/** One course at a glance: the total, what each letter takes, each group's share, and what's gone wrong or just come back. */
function CourseBreakdown({ course, onOpenCourse }: { course: GradebookCourse; onOpenCourse?: (id: string) => void }) {
  const total = courseTotal(course);
  const missing = course.assignments.filter((a) => a.state === "missing" || a.state === "missed");
  const recent = course.assignments
    .filter((a) => a.state === "graded" && a.score != null && a.gradedAt)
    .sort((a, b) => b.gradedAt!.localeCompare(a.gradedAt!))
    .slice(0, 5);
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      <div>
        <div className="er-label mb-1.5">{courseTab(course)}</div>
        <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-foreground">{course.name}</h2>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="er-display text-[22px] tabular-nums text-foreground">{total?.text ?? "No grades yet"}</span>
          {total?.estimated ? <span className="text-[13px] text-muted-foreground">Erwin&apos;s estimate — Canvas hides this course&apos;s total</span> : null}
          {!total?.estimated && course.finalScore != null ? (
            <span className="text-[13px] tabular-nums text-muted-foreground">{pct(course.finalScore)} with ungraded work as zero</span>
          ) : null}
        </p>
        {onOpenCourse ? (
          <button type="button" onClick={() => onOpenCourse(course.id)} className="er-slash mt-2 font-mono text-xs uppercase tracking-wide text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Every assignment
          </button>
        ) : null}
      </div>

      {course.remainingPoints > 0 && course.outlook.length ? (
        <div>
          <div className="er-label mb-1.5">What it takes · average on the {Math.round(course.remainingPoints)} pts left</div>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {course.outlook.map((o) => (
                <tr key={o.letter} className="border-t border-border">
                  <td className="w-12 py-1.5 font-mono text-[12px] text-foreground">{o.letter}</td>
                  <td className="w-16 py-1.5 tabular-nums text-muted-foreground">{Math.round(o.cutoff * 10) / 10}%</td>
                  <td
                    className={cn(
                      "py-1.5 text-right tabular-nums",
                      o.status === "reachable" ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {o.status === "secured" ? "Secured" : o.status === "out_of_reach" ? "Out of reach" : `${o.needed}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            Before drop rules{course.currentGrade || course.estimateLetter ? "" : ", on a standard scale"}. Missed work counts as zero.
          </p>
        </div>
      ) : null}

      <div>
        <div className="er-label mb-1.5">{course.applyGroupWeights ? "Groups · weighted" : "Groups · by points"}</div>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {course.groups.map((g) => (
              <tr key={g.id} className="border-t border-border">
                <td className="py-1.5 pr-3 text-foreground">
                  {g.name}
                  {g.dropLowest ? <span className="text-muted-foreground"> · drops lowest {g.dropLowest}</span> : null}
                </td>
                <td className="w-16 py-1.5 text-right tabular-nums text-muted-foreground">{course.applyGroupWeights && g.weight != null ? `${g.weight}%` : null}</td>
                <td className="w-24 py-1.5 text-right tabular-nums text-muted-foreground">{g.possible > 0 ? `${g.earned}/${g.possible}` : "—"}</td>
                <td className="w-16 py-1.5 text-right tabular-nums text-foreground">{g.percent != null ? `${g.percent}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {missing.length ? (
        <div>
          <div className="er-label mb-1.5 text-destructive">Missing · {missing.length}</div>
          <ul>
            {missing.map((a) => (
              <li key={a.id} className="flex h-8 items-center justify-between gap-3 border-t border-border text-[13px]">
                <span className="truncate text-foreground">{a.name}</span>
                <span className="flex-none text-muted-foreground">{a.state === "missed" ? "Closed" : "Still open"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recent.length ? (
        <div>
          <div className="er-label mb-1.5">Recently graded</div>
          <ul>
            {recent.map((a) => (
              <li key={a.id} className="flex h-8 items-center justify-between gap-3 border-t border-border text-[13px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  {a.unseen ? <UnseenPip /> : null}
                  <span className="truncate text-foreground">{a.name}</span>
                </span>
                <span className="flex-none tabular-nums text-muted-foreground">{scoreText(a)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type Row =
  | { type: "overview"; key: string }
  | { type: "group"; key: string; name: string; meta: string }
  | { type: "item"; key: string; a: GradebookAssignment };

function CourseGrades({
  course,
  selected,
  onSelect,
}: {
  course: GradebookCourse;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const markSeen = useCourseActivityStore((s) => s.markSeen);
  const rows = useMemo(() => {
    const out: Row[] = [{ type: "overview", key: `overview:${course.id}` }];
    const byGroup = new Map<string | null, GradebookAssignment[]>();
    for (const a of course.assignments) byGroup.set(a.groupId, [...(byGroup.get(a.groupId) ?? []), a]);
    const groups = [...course.groups.map((g) => ({ id: g.id as string | null, g })), { id: null, g: null }];
    for (const { id, g } of groups) {
      const list = byGroup.get(id);
      if (!list?.length) continue;
      const meta = g
        ? [course.applyGroupWeights && g.weight != null ? `${g.weight}% of grade` : null, g.percent != null ? `${g.percent}%` : null, g.dropLowest ? `drops lowest ${g.dropLowest}` : null]
            .filter(Boolean)
            .join(" · ")
        : "";
      out.push({ type: "group", key: `group:${id ?? "none"}`, name: g?.name ?? "Other", meta });
      for (const a of list) out.push({ type: "item", key: a.id, a });
    }
    return out;
  }, [course]);

  const selectedIndex = selected ? rows.findIndex((r) => r.key === selected) : -1;
  // The overview row leads, so a course tab opens on how the course is going.
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const activeRow = rows[activeIndex];
  const active = activeRow?.type === "item" ? activeRow.a : null;
  useScrollActiveIntoView([activeIndex]);

  useEffect(() => {
    if (!active?.unseen || selectedIndex < 0) return;
    const t = setTimeout(() => void markSeen({ assignmentId: active.id }), SEEN_DWELL_MS);
    return () => clearTimeout(t);
  }, [active, selectedIndex, markSeen]);

  const onKeyDown = sheetKeyHandler({
    count: rows.length,
    active: activeIndex,
    isSelectable: (i) => rows[i].type !== "group",
    select: (i) => onSelect(rows[i].key),
    open: () => {
      if (active?.htmlUrl) window.open(active.htmlUrl, "_blank", "noopener,noreferrer");
    },
  });

  const total = courseTotal(course);
  const graded = course.assignments.filter((a) => a.state === "graded" && a.score != null).length;

  return (
    <>
      <FilterStrip>
        <StripCount>
          {course.assignments.length} assignments · {graded} graded
        </StripCount>
        <span className="ml-auto px-1 text-[13px] tabular-nums text-foreground">
          {total ? (total.estimated ? `≈ ${total.text} (Erwin's estimate — Canvas hides the total)` : `Canvas ${total.text}`) : "No grades yet"}
          {!total?.estimated && course.finalScore != null ? (
            <span className="text-muted-foreground"> · final {pct(course.finalScore)}</span>
          ) : null}
        </span>
      </FilterStrip>
      <SheetLayout
        label={`${courseTab(course)} grades`}
        onKeyDown={(e) => void onKeyDown(e)}
        sheet={
          <table className="w-full min-w-[600px] table-fixed select-none border-separate border-spacing-0 text-[13px]">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 76 }} />
              <col />
              <col style={{ width: 64 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 48 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(ROW, HEAD, "left-0 z-30 text-right")}>#</th>
                <th scope="col" className={cn(ROW, HEAD)}>State</th>
                <th scope="col" className={cn(ROW, HEAD)}>Title</th>
                <th scope="col" className={cn(ROW, HEAD)}>Due</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")}>Score</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")}>%</th>
                <th scope="col" className={cn(ROW, HEAD, "text-right")} title="Class mean, when the instructor shares it">Mean</th>
                <th scope="col" className={cn(ROW, HEAD, "border-r-0 text-right")} title="Feedback comments">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                if (row.type === "overview") {
                  const isActive = i === activeIndex;
                  const cell = cellClass(isActive);
                  return (
                    <tr key={row.key} data-active-row={isActive || undefined} onClick={() => onSelect(row.key)} className="group cursor-cell">
                      <td className={gutterClass(isActive)}>{i + 1}</td>
                      <td className={cn(cell, "font-mono text-[10px] uppercase tracking-wide text-muted-foreground")}>All</td>
                      <td className={cn(cell, titleCellClass(isActive), "text-foreground")}>Overview</td>
                      <td className={cell} />
                      <td className={cn(cell, "text-right tabular-nums text-foreground")}>{total?.text ?? null}</td>
                      <td className={cell} />
                      <td className={cell} />
                      <td className={cn(cell, "border-r-0")} />
                    </tr>
                  );
                }
                if (row.type === "group") {
                  return (
                    <tr key={row.key}>
                      <td className={gutterClass(false)}>{i + 1}</td>
                      <td colSpan={7} className={BAND}>
                        <span className="flex items-center gap-3 truncate">
                          <span className="truncate text-[12px] font-medium text-foreground">{row.name}</span>
                          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{row.meta}</span>
                        </span>
                      </td>
                    </tr>
                  );
                }
                const { a } = row;
                const isActive = i === activeIndex;
                const cell = cellClass(isActive);
                const p = a.state === "graded" ? percentOf(a) : null;
                const notes = a.comments.filter((c) => !c.mine).length;
                return (
                  <tr key={row.key} data-active-row={isActive || undefined} onClick={() => onSelect(row.key)} className="group cursor-cell">
                    <td className={gutterClass(isActive)}>{i + 1}</td>
                    <td className={cell}>{stateTag(a)}</td>
                    <td className={cn(cell, titleCellClass(isActive), a.omitFromFinalGrade ? "text-muted-foreground" : "text-foreground")} title={a.name}>
                      <span className="flex items-center gap-1.5 truncate">
                        {a.unseen ? <UnseenPip /> : null}
                        <span className={cn("truncate", a.unseen && "font-medium")}>{a.name}</span>
                      </span>
                    </td>
                    <td className={cn(cell, "tabular-nums text-muted-foreground")} title={a.dueAt ? format(new Date(a.dueAt), "PPpp") : undefined}>
                      {a.dueAt ? shortDate(new Date(a.dueAt)) : null}
                    </td>
                    <td className={cn(cell, "text-right tabular-nums text-foreground")}>
                      {a.state === "graded" ? scoreText(a) : a.pointsPossible != null ? <span className="text-muted-foreground">– / {a.pointsPossible}</span> : null}
                    </td>
                    <td className={cn(cell, "text-right tabular-nums text-muted-foreground")}>{p != null ? Math.round(p) : null}</td>
                    <td className={cn(cell, "text-right tabular-nums text-muted-foreground")}>
                      {a.scoreStatistics?.mean != null ? Math.round(a.scoreStatistics.mean * 10) / 10 : null}
                    </td>
                    <td className={cn(cell, "border-r-0 text-right tabular-nums text-muted-foreground")}>{notes || null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
        pane={
          active ? (
            <AssignmentPane key={active.id} a={active} course={course} />
          ) : (
            <CourseBreakdown course={course} />
          )
        }
      />
    </>
  );
}

function AssignmentPane({ a, course }: { a: GradebookAssignment; course: GradebookCourse }) {
  const group = course.groups.find((g) => g.id === a.groupId);
  const facts = [
    a.dueAt ? `Due ${format(new Date(a.dueAt), "EEE MMM d, p")}` : "No due date",
    a.pointsPossible != null ? `${a.pointsPossible} pts` : null,
    group?.name,
    a.omitFromFinalGrade ? "Doesn't count toward the grade" : null,
  ].filter(Boolean);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-4 border-b border-border p-4">
        <div>
          <div className="er-label mb-1.5">{courseTab(course)}</div>
          <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-foreground">{a.name}</h2>
          <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">{facts.join(" · ")}</p>
          {a.htmlUrl ? (
            <a href={a.htmlUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-rust-text">
              Open in Canvas
            </a>
          ) : null}
        </div>
        <GradeBlock data={a} />
      </div>
      {a.task ? (
        <TaskPacketBody taskId={a.task.id} />
      ) : (
        <p className="p-4 text-[13px] text-muted-foreground">A gradebook line, not a task — nothing to hand in.</p>
      )}
    </div>
  );
}
