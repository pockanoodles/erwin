-- Erwin v3: goal DAG (GoalLink), task↔goal many-to-many (TaskGoalLink),
-- hex Build (GoalCycle.focusStats) and boss goals (Goal.isBoss/targetDate/develops).
-- Existing tree parents and task goal links are backfilled into the join tables
-- before the old single-link columns are dropped.

-- CreateTable
CREATE TABLE "GoalLink" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskGoalLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskGoalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalLink_childId_idx" ON "GoalLink"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalLink_parentId_childId_key" ON "GoalLink"("parentId", "childId");

-- CreateIndex
CREATE INDEX "TaskGoalLink_goalId_idx" ON "TaskGoalLink"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskGoalLink_taskId_goalId_key" ON "TaskGoalLink"("taskId", "goalId");

-- AddForeignKey
ALTER TABLE "GoalLink" ADD CONSTRAINT "GoalLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalLink" ADD CONSTRAINT "GoalLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGoalLink" ADD CONSTRAINT "TaskGoalLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskGoalLink" ADD CONSTRAINT "TaskGoalLink_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: tree parents become DAG edges
INSERT INTO "GoalLink" ("id", "parentId", "childId")
SELECT gen_random_uuid()::text, "parentGoalId", "id"
FROM "Goal"
WHERE "parentGoalId" IS NOT NULL;

-- Backfill: single task→goal links become join rows
INSERT INTO "TaskGoalLink" ("id", "taskId", "goalId")
SELECT gen_random_uuid()::text, "id", "goalId"
FROM "Task"
WHERE "goalId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Goal" DROP CONSTRAINT "Goal_parentGoalId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_goalId_fkey";

-- DropIndex
DROP INDEX "Goal_parentGoalId_idx";

-- DropIndex
DROP INDEX "Task_goalId_idx";

-- AlterTable
ALTER TABLE "Goal" DROP COLUMN "parentGoalId",
ADD COLUMN     "develops" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isBoss" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GoalCycle" ADD COLUMN "focusStats" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "goalId";
