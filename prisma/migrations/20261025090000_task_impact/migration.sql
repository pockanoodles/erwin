-- Focus ranks by what a task is worth, whichever module owns it: Canvas's
-- grade impact becomes the generic `impact`, and "Canvas closed it" becomes
-- the generic `closedAt`. A rename, so no score is lost.
ALTER TABLE "Task" RENAME COLUMN "gradeImpactScore" TO "impact";
ALTER TABLE "Task" ADD COLUMN "closedAt" TIMESTAMP(3);

-- Canvas closed these without a submission: missed (it locked) or the course
-- ended. Timestamps are naive UTC, hence timezone('UTC', now()).
UPDATE "Task"
SET "closedAt" = LEAST("lockAt", timezone('UTC', now()))
WHERE "source" = 'CANVAS'
  AND "status" <> 'completed'
  AND "submissionStatus" IN ('missed', 'ended');
