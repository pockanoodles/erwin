"use client";

import { formatDay } from "@/components/goals/types";

import { type FocusQueueTask, primaryLadderGoal } from "@/lib/erwin/parse-task";

/** Ladder's section in Today's panel: the goal the selected task works toward. */
export function TodayGoalSection({ task }: { task: FocusQueueTask }) {
  const goal = primaryLadderGoal(task);

  return (
    <div className="mt-8 border-t border-border pt-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Goal
      </p>
      {goal ? (
        <div className="mt-3">
          <h3 className="text-lg font-medium">{goal.title}</h3>
          {goal.targetDate && (
            <p className="mt-1 text-sm text-foreground">
              By {formatDay(goal.targetDate)}
            </p>
          )}
          {goal.whyItMatters && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {goal.whyItMatters}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Not linked to a goal yet. Pick one in its Goal column on the Tasks
          page.
        </p>
      )}
    </div>
  );
}
