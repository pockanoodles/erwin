"use client";

import { formatDay } from "@/components/goals/types";

import { type FocusQueueTask, primaryLadderGoal } from "@/lib/erwin/parse-task";

/** Ladder's section in Today's panel: the goal the selected task climbs toward. */
export function TodayGoalSection({ task }: { task: FocusQueueTask }) {
  const goal = primaryLadderGoal(task);

  return (
    <div className="mt-8 border-t border-border pt-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Ladders to
      </p>
      {goal ? (
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            {goal.isBoss && (
              <span className="font-mono text-sm text-rust-text">⚔</span>
            )}
            <h3 className="text-lg font-medium">{goal.title}</h3>
          </div>
          {goal.targetDate && (
            <p className="mt-1 text-sm">
              <span className="text-rust-text">
                {goal.isBoss ? "Boss" : "Target"} — {formatDay(goal.targetDate)}
              </span>
            </p>
          )}
          {goal.develops.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {goal.develops.map((stat) => (
                <span
                  key={stat}
                  className="bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  {stat}
                </span>
              ))}
            </div>
          )}
          {goal.whyItMatters && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {goal.whyItMatters}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Not linked to a goal yet. Give it a Lord from the task&apos;s menu to
          see the climb.
        </p>
      )}
    </div>
  );
}
