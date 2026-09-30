-- Goal rules: a Lord claims task sources, a boss binds to a Canvas assignment,
-- and a hand-picked goal pins a task so the rules leave it alone.
ALTER TABLE "Goal" ADD COLUMN "taskSources" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Goal" ADD COLUMN "canvasAssignmentId" TEXT;
ALTER TABLE "Task" ADD COLUMN "goalsPinned" BOOLEAN NOT NULL DEFAULT false;

-- Until now the only automatic link was a vault task to the Lord its source
-- names. Any other link was made by hand, so its task is pinned.
UPDATE "Task" t SET "goalsPinned" = true
WHERE EXISTS (
  SELECT 1 FROM "TaskGoalLink" l JOIN "Goal" g ON g.id = l."goalId"
  WHERE l."taskId" = t.id AND (g."externalId" IS NULL OR g."externalId" <> t.source)
);
