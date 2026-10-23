"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { format } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import { GradeBlock } from "./GradeBlock";
import { kindLabel, openTarget, sizeLabel, statusLabel } from "./material-meta";
import type { PacketMaterial, RubricCriterion, TaskPacket } from "@/types/course-materials";
import { useResource } from "@/hooks/use-resource";

/**
 * The task packet: everything Canvas says about one assignment — the
 * instructions, how it's graded, and what to read for it — pulled into
 * Erwin so doing the work doesn't start with a Canvas login. The pieces are
 * separate so Focus can lay them across its columns; `TaskPacketPane` stacks
 * them for the Tasks sheet.
 */

export const packetUrl = (taskId: string) => `/api/erwin/tasks/${taskId}/materials`;

/** The packet for a Canvas task; null (and no request) for anything else. */
export function useTaskPacket(taskId: string | null, source: string | null | undefined) {
  return useResource<TaskPacket>(taskId && source === "CANVAS" ? packetUrl(taskId) : null);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="er-label mb-1.5">{children}</div>
  );
}

/** Sanitized Canvas HTML. The server already cleaned it (lib/canvas/clean-html.ts). */
export function CanvasHtml({ html, className }: { html: string; className?: string }) {
  return <div className={cn("canvas-html", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

const COLLAPSED_PX = 240;

/** Instructions, folded past a screenful so the rubric and materials stay in reach. */
export function PacketInstructions({ html, className }: { html: string | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    setOpen(false);
    const el = ref.current;
    setOverflows(Boolean(el && el.scrollHeight > COLLAPSED_PX + 24));
  }, [html]);

  if (!html) {
    return (
      <p className={cn("text-[14px] text-muted-foreground", className)}>
        No instructions on Canvas.
      </p>
    );
  }

  return (
    <div className={className}>
      <div
        ref={ref}
        className="relative overflow-hidden"
        style={!open && overflows ? { maxHeight: COLLAPSED_PX } : undefined}
      >
        <CanvasHtml html={html} className="max-w-[68ch]" />
        {!open && overflows ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background" />
        ) : null}
      </div>
      {overflows ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          {open ? "Show less" : "Show all instructions"}
        </button>
      ) : null}
    </div>
  );
}

function topRating(c: RubricCriterion) {
  return [...(c.ratings ?? [])].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
}

/** The rubric as a two-column sheet: what's graded, and what full marks takes. */
export function PacketRubric({ rubric, className }: { rubric: RubricCriterion[] | null; className?: string }) {
  if (!rubric?.length) return null;
  const total = rubric.reduce((sum, c) => sum + (c.points ?? 0), 0);
  return (
    <div className={className}>
      <SectionLabel>Rubric · {total} pts</SectionLabel>
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {rubric.map((c) => {
            const best = topRating(c);
            const bar = best?.long_description || best?.description;
            return (
              <tr key={c.id} className="border-t border-border align-top">
                <td className="py-2 pr-3">
                  <p className="text-foreground">{c.description}</p>
                  {bar && bar !== c.description ? (
                    <p className="mt-0.5 text-muted-foreground">{bar}</p>
                  ) : null}
                </td>
                <td className="w-12 py-2 text-right tabular-nums text-foreground">{c.points ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MaterialRow({ m }: { m: PacketMaterial }) {
  const target = openTarget(m);
  const status = statusLabel(m);
  const meta = status ?? (m.kind === "FILE" ? sizeLabel(m.sizeBytes) : null);
  const body = (
    <>
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {kindLabel(m)}
      </span>
      <span className="truncate">{m.title}</span>
      <span className="flex-none text-[12px] tabular-nums text-muted-foreground">{meta}</span>
    </>
  );
  const rowClass =
    "grid h-8 grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 border-t border-border text-[13px]";
  return (
    <li title={m.module ? `${m.title} — ${m.module.name}` : m.title}>
      {target ? (
        <a
          href={target.href}
          {...(target.external || target.href.startsWith("/api/")
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className={cn(rowClass, "transition-colors duration-150 hover:text-rust-text")}
        >
          {body}
        </a>
      ) : (
        <div className={cn(rowClass, "text-muted-foreground")}>{body}</div>
      )}
    </li>
  );
}

/**
 * What to read for the task. "Cited" — the instructions link to it — comes
 * first and is the one thing marked; "Same module" is everything else Canvas
 * files alongside the assignment.
 */
export function PacketMaterials({ materials, className }: { materials: PacketMaterial[]; className?: string }) {
  const cited = materials.filter((m) => m.reason === "DESCRIPTION");
  const sameModule = materials.filter((m) => m.reason === "MODULE");
  if (materials.length === 0) {
    return (
      <div className={className}>
        <SectionLabel>Materials</SectionLabel>
        <p className="text-[13px] text-muted-foreground">Nothing linked on Canvas.</p>
      </div>
    );
  }
  return (
    <div className={cn("space-y-4", className)}>
      {cited.length ? (
        <div>
          <SectionLabel>
            <span className="text-rust-text">Cited in the instructions</span> · {cited.length}
          </SectionLabel>
          <ul>{cited.map((m) => <MaterialRow key={m.id} m={m} />)}</ul>
        </div>
      ) : null}
      {sameModule.length ? (
        <div>
          <SectionLabel>Same module · {sameModule.length}</SectionLabel>
          <ul>{sameModule.map((m) => <MaterialRow key={m.id} m={m} />)}</ul>
        </div>
      ) : null}
    </div>
  );
}

export function PacketStatus({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <p className="text-[13px] text-destructive">Couldn&apos;t load the packet: {error}</p>;
  if (loading) return <p className="text-[13px] text-muted-foreground">Loading packet…</p>;
  return null;
}

/**
 * How the assignment went, or the rules for taking it — shown once there's
 * something to say: a submission, a grade, feedback, or quiz settings.
 */
export function PacketGrade({ packet, className }: { packet: TaskPacket; className?: string }) {
  const g = packet.grade;
  if (!g || (g.state === "unsubmitted" && !g.quiz && g.comments.length === 0)) return null;
  return (
    <GradeBlock
      className={className}
      data={{ ...g, pointsPossible: packet.pointsPossible, dueAt: packet.dueDate, rubric: packet.rubric }}
    />
  );
}

/** Instructions, rubric and materials — the packet without its header, for a pane that has its own. */
export function TaskPacketBody({ taskId }: { taskId: string }) {
  const { data, loading, error } = useTaskPacket(taskId, "CANVAS");
  if (!data) {
    return (
      <div className="p-4">
        <PacketStatus loading={loading} error={error} />
      </div>
    );
  }
  return (
    <div className="space-y-6 p-4">
      <div>
        <SectionLabel>Instructions</SectionLabel>
        <PacketInstructions html={data.instructionsHtml} />
      </div>
      <PacketRubric rubric={data.rubric} />
      <PacketMaterials materials={data.materials} />
    </div>
  );
}

/** The whole packet stacked in one column — the Tasks sheet's side pane. */
export function TaskPacketPane({
  taskId,
  source,
}: {
  taskId: string | null;
  source: string | null | undefined;
}) {
  const { data, loading, error } = useTaskPacket(taskId, source);

  if (!taskId) {
    return <p className="p-4 text-[13px] text-muted-foreground">Select a task.</p>;
  }
  if (source !== "CANVAS") {
    return (
      <p className="p-4 text-[13px] text-muted-foreground">
        Packets come from Canvas; this task isn&apos;t a Canvas assignment.
      </p>
    );
  }
  if (!data) {
    return (
      <div className="p-4">
        <PacketStatus loading={loading} error={error} />
      </div>
    );
  }

  const due = data.dueDate ? new Date(data.dueDate) : null;
  const facts = [
    due ? format(due, "EEE MMM d, p") : "No due date",
    data.pointsPossible != null ? `${data.pointsPossible} pts` : null,
    data.gradeWeightPercent != null ? `${data.gradeWeightPercent}% of grade` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6 p-4">
      <div>
        <SectionLabel>{data.courseName ?? "Canvas"}</SectionLabel>
        <h2 className="text-[17px] font-medium leading-snug tracking-[-0.01em] text-foreground">{data.title}</h2>
        <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">{facts.join(" · ")}</p>
        {data.externalUrl ? (
          <a
            href={data.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[13px] text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-rust-text"
          >
            Open in Canvas
          </a>
        ) : null}
      </div>
      <PacketGrade packet={data} />
      <div>
        <SectionLabel>Instructions</SectionLabel>
        <PacketInstructions html={data.instructionsHtml} />
      </div>
      <PacketRubric rubric={data.rubric} />
      <PacketMaterials materials={data.materials} />
    </div>
  );
}
