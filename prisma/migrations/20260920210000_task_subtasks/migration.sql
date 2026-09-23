-- One-level subtasks: children point at a parent Task. Deleting the parent
-- deletes its children. Canvas sync does not create these rows; local
-- children of a Canvas assignment are skipSync checklists.

ALTER TABLE "Task" ADD COLUMN "parentTaskId" TEXT;
ALTER TABLE "Task" ADD COLUMN "order" INTEGER;

ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey"
  FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Task_parentTaskId_order_idx" ON "Task"("parentTaskId", "order");
