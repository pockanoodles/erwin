-- A boss can name an Erwin task as its proof: finishing the task fells it.
ALTER TABLE "Goal" ADD COLUMN "proofTaskId" TEXT;

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_proofTaskId_fkey" FOREIGN KEY ("proofTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
