"use client";

import type { ReactNode } from "react";

import {
  PacketGrade,
  PacketInstructions,
  PacketMaterials,
  PacketRubric,
  PacketStatus,
  useTaskPacket,
} from "@/components/packet/TaskPacket";
import { Button } from "@/components/ui/button";

import { format } from "@/lib/date-utils";
import { primaryLadderGoal, type FocusQueueTask } from "@/lib/erwin/parse-task";
import { cn } from "@/lib/utils";
import { TaskStatus } from "@/types/task";

interface FocusDeskProps {
  task: FocusQueueTask;
  upNext: FocusQueueTask[];
  /** 1-based place in the ranked queue, and how many are ranked. */
  position: { index: number; total: number };
  doneToday: number | null;
  freeHours: number | null;
  nextEvent: { title: string; startsIn: string } | null;
  acting: boolean;
  onDone: () => void;
  onSkip: () => void;
  onLater: () => void;
  onToggleSubtask: (id: string, completed: boolean) => void;
}

function linkify(text: string): ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  const urls = text.match(urlRegex) || [];
  const result: ReactNode[] = [];
  parts.forEach((part, i) => {
    result.push(part);
    if (urls[i]) {
      result.push(
        <a
          key={i}
          href={urls[i]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-rust-text hover:underline"
        >
          {urls[i]}
        </a>
      );
    }
  });
  return result;
}

function label(text: string) {
  return (
    <div className="er-label mb-1.5">{text}</div>
  );
}

function fact(title: string, body: ReactNode) {
  if (!body) return null;
  return (
    <div className="border-t border-border py-3 first:border-t-0 first:pt-0">
      {label(title)}
      <div className="text-[14px] leading-snug text-foreground">{body}</div>
    </div>
  );
}

function clock(task: FocusQueueTask): string | null {
  if (!task.scheduledStart) return null;
  const start = format(task.scheduledStart, "p");
  if (!task.scheduledEnd) return start;
  return `${start}–${format(task.scheduledEnd, "p")}`;
}

/**
 * Full-screen focus desk. Three columns — context, the work, the grade —
 * and a two-line tape of what comes next. One task, the whole viewport.
 */
export function FocusDesk({
  task,
  upNext,
  position,
  doneToday,
  freeHours,
  nextEvent,
  acting,
  onDone,
  onSkip,
  onLater,
  onToggleSubtask,
}: FocusDeskProps) {
  const goal = primaryLadderGoal(task);
  // Canvas tasks carry a packet: sanitized instructions, rubric, materials.
  // Their description is raw Canvas HTML, so it's never printed as text.
  const isCanvas = task.source === "CANVAS";
  const packet = useTaskPacket(task.id, task.source);
  const projection = task.erwin?.gradeProjection;
  const weight = task.gradeWeightPercent ?? task.erwin?.gradeImpactPercent;
  const due = task.dueDate
    ? task.dueDate instanceof Date
      ? task.dueDate
      : new Date(task.dueDate)
    : null;
  const countdown = task.erwin?.countdownHuman;
  const subtasks = task.subtasks ?? [];
  const doneCount = subtasks.filter(
    (child) => child.status === TaskStatus.COMPLETED
  ).length;
  const windowLabel = clock(task);
  const fit = [task.energyLevel, task.preferredTime, task.duration ? `${task.duration} min` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 flex-none items-center justify-between px-4 text-[13px] text-muted-foreground md:px-6">
        <span>
          {position.index} of {position.total}
        </span>
        <span className="flex gap-4">
          {doneToday != null ? <span>{doneToday} done today</span> : null}
          {freeHours != null ? <span>{freeHours}h free</span> : null}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)_300px]">
        <section className="border-t border-border px-4 py-4 md:overflow-y-auto md:border-r md:border-t-0 md:px-5">
          {label("Context")}
          <div className="mt-3">
            {fact(
              "Course",
              task.courseName ? (
                <>
                  <p>{task.courseName}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {[task.source, task.category].filter(Boolean).join(" · ")}
                  </p>
                </>
              ) : (
                task.project?.name ?? task.category ?? null
              )
            )}
            {fact(
              "Goal",
              goal ? (
                <>
                  <p>{goal.title}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {goal.isBoss ? "Boss" : "Lord"}
                    {goal.targetDate
                      ? ` · ${format(new Date(goal.targetDate), "MMM yyyy")}`
                      : ""}
                  </p>
                </>
              ) : null
            )}
            {/* Loading and errors are reported once, in the work column. */}
            {packet.data ? (
              <div className="border-t border-border py-3">
                <PacketMaterials materials={packet.data.materials} />
              </div>
            ) : null}
            {fact("Because", goal?.whyItMatters)}
            {fact(
              "Calendar",
              windowLabel || nextEvent ? (
                <>
                  {windowLabel ? <p className="tabular-nums">{windowLabel}</p> : null}
                  {nextEvent ? (
                    <p className="mt-0.5 text-muted-foreground">
                      {nextEvent.title} {nextEvent.startsIn}
                    </p>
                  ) : null}
                </>
              ) : null
            )}
            {fact("Fit", fit || null)}
          </div>
        </section>

        <section className="flex min-h-0 flex-col border-t border-border px-4 py-4 md:overflow-y-auto md:border-t-0 md:px-8 md:py-5">
          <div className="er-label">
            {[
              task.submissionStatus?.replaceAll("_", " "),
              task.erwin?.urgencyTier && task.erwin.urgencyTier !== "NONE"
                ? task.erwin.urgencyTier.toLowerCase()
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Now"}
          </div>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.15] tracking-[-0.02em] text-foreground md:text-[32px]">
            {task.title}
          </h1>
          <div className="er-track mt-4 max-w-[62ch]" aria-hidden />
          {isCanvas ? (
            packet.data ? (
              <>
                {/* Quiz rules before the instructions: a timed, one-attempt
                    LockDown exam changes how you start it. */}
                <PacketGrade packet={packet.data} className="mt-4 max-w-[68ch]" />
                <PacketInstructions html={packet.data.instructionsHtml} className="mt-4" />
                <PacketRubric rubric={packet.data.rubric} className="mt-6 max-w-[68ch]" />
              </>
            ) : (
              <div className="mt-4">
                <PacketStatus loading={packet.loading} error={packet.error} />
              </div>
            )
          ) : task.description ? (
            <p className="mt-4 max-w-[62ch] whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {linkify(task.description)}
            </p>
          ) : null}
          {task.externalUrl ? (
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-[14px] text-foreground underline decoration-border underline-offset-4 hover:text-rust-text"
            >
              Open in {task.source === "CANVAS" ? "Canvas" : "source"}
            </a>
          ) : null}

          {subtasks.length > 0 ? (
            <div className="mt-6">
              <div className="er-label">
                Checklist · {doneCount} of {subtasks.length}
              </div>
              <ul className="mt-1">
                {subtasks.map((child) => {
                  const completed = child.status === TaskStatus.COMPLETED;
                  return (
                    <li key={child.id} className="border-t border-border">
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() => onToggleSubtask(child.id, !completed)}
                        className="flex h-11 w-full items-center gap-3 text-left text-[14px]"
                      >
                        <span
                          className={cn(
                            "h-3.5 w-3.5 flex-none border border-foreground",
                            completed && "bg-foreground"
                          )}
                          aria-hidden
                        />
                        <span className={cn(completed && "text-muted-foreground")}>
                          {child.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="mt-auto flex gap-2 pt-6">
            <Button type="button" disabled={acting} onClick={onDone} className="h-9 min-w-[108px]">
              Done
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={acting}
              onClick={onSkip}
              className="h-9 min-w-[88px]"
            >
              Skip
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={acting}
              onClick={onLater}
              className="h-9 min-w-[88px]"
            >
              Later
            </Button>
          </div>
        </section>

        <section className="border-t border-border px-4 py-4 md:overflow-y-auto md:border-l md:border-t-0 md:px-5">
          {label("Book")}
          {projection ? (
            <>
              <p className="er-display mt-2 text-[52px] leading-none tracking-normal text-rust-text">
                {projection.letterCurrent}
              </p>
              <p className="mt-2 text-[14px] text-muted-foreground">
                {projection.letterIfMissed} if this is missed
              </p>
            </>
          ) : countdown ? (
            <p className="er-display mt-2 text-[30px] leading-none tracking-normal text-rust-text tabular-nums">
              {countdown}
            </p>
          ) : (
            <p className="mt-3 text-[14px] text-muted-foreground">No deadline</p>
          )}
          <div className="mt-4">
            {fact(
              "Weight",
              weight != null ? (
                <span className="tabular-nums">{weight}% of the course</span>
              ) : null
            )}
            {fact(
              "Due",
              due ? (
                <span className="tabular-nums">
                  {countdown ? `${countdown} · ` : ""}
                  {format(due, "PPP p")}
                </span>
              ) : null
            )}
            {fact(
              "Pressure",
              (task.skipCount ?? 0) > 0
                ? `Skipped ${task.skipCount}×${
                    task.erwin?.lastSkippedAgo
                      ? `, ${task.erwin.lastSkippedAgo}`
                      : ""
                  }`
                : task.erwin?.effortEstimate ?? null
            )}
          </div>
        </section>
      </div>

      <div className="flex-none border-t border-border">
        {upNext.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground md:px-6">
            Nothing else ranked.
          </p>
        ) : (
          upNext.map((next, i) => (
            <div
              key={next.id}
              className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-4 py-2.5 text-[14px] first:border-t-0 md:px-6"
            >
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {String(i + 2).padStart(2, "0")}
              </span>
              <span className="truncate">{next.title}</span>
              <span className="text-[12px] text-muted-foreground">
                {[
                  next.erwin?.countdownHuman,
                  next.courseName,
                  next.erwin?.gradeImpactPercent != null
                    ? `${next.erwin.gradeImpactPercent}%`
                    : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
