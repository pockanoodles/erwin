"use client";

import { Card, CardContent } from "@/components/ui/card";

import type { FocusQueueTask } from "@/lib/erwin/parse-task";

interface UpNextProps {
  tasks: FocusQueueTask[];
}

/**
 * Ranked tasks #2 and #3 (docs/focus-mode.md §2.2).
 */
export function UpNext({ tasks }: UpNextProps) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No other ranked tasks.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {tasks.map((t, i) => (
        <li key={t.id}>
          <Card>
            <CardContent className="p-3 text-sm">
              <span className="text-xs text-muted-foreground">#{i + 2}</span>
              <p className="font-medium leading-snug">{t.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.erwin?.countdownHuman ?? ""}
                {t.erwin?.countdownHuman && t.erwin?.gradeImpactPercent != null
                  ? " · "
                  : ""}
                {t.erwin?.gradeImpactPercent != null
                  ? `${t.erwin.gradeImpactPercent}%`
                  : ""}
                {t.courseName ? ` · ${t.courseName}` : ""}
              </p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
