"use client";

import { format } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

import type { RubricCriterion } from "@/types/course-materials";

/**
 * How a Canvas assignment went, or the rules for taking it: submission state,
 * score against the class, quiz settings, grader feedback and rubric marks.
 * Shared by the Grades view and the task packet (Focus, Tasks, Library).
 */

export interface GradeBlockData {
  state: string;
  score: number | null;
  grade: string | null;
  pointsPossible: number | null;
  dueAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  late: boolean;
  pointsDeducted: number | null;
  scoreStatistics: { mean?: number; median?: number; min?: number; max?: number } | null;
  comments: Array<{ id: string; author: string | null; body: string; createdAt: string | null; mine: boolean }>;
  rubricAssessment: Record<string, { points?: number | null; rating_id?: string | null; comments?: string | null }> | null;
  rubric: RubricCriterion[] | null;
  quiz: { timeLimit: number | null; allowedAttempts: number | null; questionCount: number | null; lockdownBrowser: boolean } | null;
}

/** Sigwald's submission state as a stencil word, and whether it's bad news. */
export const STATE_LABEL: Record<string, { word: string; tone?: "danger" }> = {
  unsubmitted: { word: "Open" },
  missing: { word: "Missing", tone: "danger" },
  missed: { word: "Missed", tone: "danger" },
  ended: { word: "Ended" },
  submitted: { word: "Submitted" },
  pending_review: { word: "In review" },
  graded: { word: "Graded" },
  excused: { word: "Excused" },
};

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ""));

export function scoreText(d: Pick<GradeBlockData, "score" | "grade" | "pointsPossible">): string | null {
  if (d.score != null && d.pointsPossible) return `${n(d.score)} / ${n(d.pointsPossible)}`;
  if (d.score != null) return n(d.score);
  return d.grade;
}

export function percentOf(d: Pick<GradeBlockData, "score" | "pointsPossible">): number | null {
  return d.score != null && d.pointsPossible ? (d.score / d.pointsPossible) * 100 : null;
}

function quizRules(q: NonNullable<GradeBlockData["quiz"]>): string {
  return [
    q.timeLimit ? `${q.timeLimit} min` : "Untimed",
    q.allowedAttempts == null ? null : q.allowedAttempts < 0 ? "Unlimited attempts" : `${q.allowedAttempts} attempt${q.allowedAttempts === 1 ? "" : "s"}`,
    q.questionCount ? `${q.questionCount} questions` : null,
    q.lockdownBrowser ? "LockDown Browser" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="er-label mb-1.5">{children}</div>;
}

export function GradeBlock({ data, className }: { data: GradeBlockData; className?: string }) {
  const state = STATE_LABEL[data.state] ?? { word: data.state };
  const score = data.state === "graded" ? scoreText(data) : null;
  const pct = data.state === "graded" ? percentOf(data) : null;
  const stats = data.scoreStatistics;
  const marks = data.rubricAssessment;

  const facts = [
    data.submittedAt ? `Submitted ${format(new Date(data.submittedAt), "MMM d, p")}` : null,
    data.late ? "late" : null,
    data.pointsDeducted ? `−${n(data.pointsDeducted)} pts late penalty` : null,
    data.state === "graded" && !score ? "Grade not posted yet" : null,
  ].filter(Boolean);

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <Label>Grade</Label>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className={cn(
              "er-bracketed font-mono text-[11px] uppercase tracking-[0.08em]",
              state.tone === "danger" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {state.word}
          </span>
          {score ? <span className="text-[17px] font-medium tabular-nums text-foreground">{score}</span> : null}
          {pct != null ? <span className="text-[13px] tabular-nums text-muted-foreground">{n(pct)}%</span> : null}
        </p>
        {facts.length ? <p className="mt-1 text-[13px] text-muted-foreground">{facts.join(" · ")}</p> : null}
        {stats && (stats.mean != null || stats.max != null) ? (
          <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
            Class{" "}
            {[
              stats.mean != null ? `mean ${n(stats.mean)}` : null,
              stats.median != null ? `median ${n(stats.median)}` : null,
              stats.min != null && stats.max != null ? `range ${n(stats.min)}–${n(stats.max)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      {data.quiz ? (
        <div>
          <Label>Quiz rules</Label>
          <p className="text-[13px] text-foreground">{quizRules(data.quiz)}</p>
        </div>
      ) : null}

      {data.comments.length ? (
        <div>
          <Label>Feedback · {data.comments.filter((c) => !c.mine).length}</Label>
          <ul className="space-y-3">
            {data.comments.map((c) => (
              <li key={c.id} className="border-t border-border pt-2 text-[14px]">
                <p className="mb-0.5 text-[12px] text-muted-foreground">
                  {c.mine ? "You" : (c.author ?? "Grader")}
                  {c.createdAt ? ` · ${format(new Date(c.createdAt), "MMM d, p")}` : ""}
                </p>
                <p className={cn("whitespace-pre-wrap", c.mine ? "text-muted-foreground" : "text-foreground")}>{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {marks && data.rubric?.length ? (
        <div>
          <Label>Rubric marks</Label>
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {data.rubric.map((c) => {
                const mark = marks[c.id];
                const rating = c.ratings?.find((r) => r.id === mark?.rating_id);
                return (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3">
                      <p className="text-foreground">{c.description}</p>
                      {rating?.description ? <p className="mt-0.5 text-muted-foreground">{rating.description}</p> : null}
                      {mark?.comments ? <p className="mt-0.5 whitespace-pre-wrap text-foreground">{mark.comments}</p> : null}
                    </td>
                    <td className="w-20 py-2 text-right tabular-nums text-foreground">
                      {mark?.points != null ? n(mark.points) : "—"}
                      <span className="text-muted-foreground"> / {c.points ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
