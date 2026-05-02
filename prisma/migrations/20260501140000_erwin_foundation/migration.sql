-- Erwin foundation: Canvas/ranking fields, TaskInteraction, RankerState, CalDAV transparency

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "transparency" TEXT;

-- AlterTable
ALTER TABLE "TaskProvider" ADD COLUMN IF NOT EXISTS "syncIntervalMinutes" INTEGER DEFAULT 120;
ALTER TABLE "TaskProvider" ADD COLUMN IF NOT EXISTS "serverUrl" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lockAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "unlockAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "taskProviderId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "gradeImpactScore" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "urgencyTier" TEXT DEFAULT 'NONE';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "skipCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastSkippedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "timesSurfaced" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "courseId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "courseName" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "assignmentGroupName" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "pointsPossible" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "groupWeight" DOUBLE PRECISION;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "submissionTypes" JSONB;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "gradingType" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "submissionStatus" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "omitFromFinalGrade" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'PERSONAL';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_taskProviderId_idx" ON "Task"("taskProviderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_urgencyTier_idx" ON "Task"("urgencyTier");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_taskProviderId_fkey'
  ) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_taskProviderId_fkey"
      FOREIGN KEY ("taskProviderId") REFERENCES "TaskProvider"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TaskInteraction" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "contextJson" JSONB NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskInteraction_taskId_idx" ON "TaskInteraction"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskInteraction_sessionId_idx" ON "TaskInteraction"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaskInteraction_createdAt_idx" ON "TaskInteraction"("createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TaskInteraction_taskId_fkey'
  ) THEN
    ALTER TABLE "TaskInteraction" ADD CONSTRAINT "TaskInteraction_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RankerState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightVector" JSONB NOT NULL,
    "learningRate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "totalUpdates" INTEGER NOT NULL DEFAULT 0,
    "alpha" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "completionRate" DOUBLE PRECISION,
    "avgSkipsBeforeComplete" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankerState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RankerState_userId_key" ON "RankerState"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RankerState_userId_idx" ON "RankerState"("userId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RankerState_userId_fkey'
  ) THEN
    ALTER TABLE "RankerState" ADD CONSTRAINT "RankerState_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
