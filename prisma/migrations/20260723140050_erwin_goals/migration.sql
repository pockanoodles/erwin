-- AlterTable
ALTER TABLE "RankerState" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "goalId" TEXT;

-- CreateTable
CREATE TABLE "GoalCycle" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "whyItMatters" TEXT,
    "definitionOfDone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "importanceScore" DOUBLE PRECISION DEFAULT 50,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalCycle_userId_idx" ON "GoalCycle"("userId");

-- CreateIndex
CREATE INDEX "GoalCycle_status_idx" ON "GoalCycle"("status");

-- CreateIndex
CREATE INDEX "Goal_cycleId_idx" ON "Goal"("cycleId");

-- CreateIndex
CREATE INDEX "Goal_userId_idx" ON "Goal"("userId");

-- CreateIndex
CREATE INDEX "Goal_status_idx" ON "Goal"("status");

-- CreateIndex
CREATE INDEX "Task_goalId_idx" ON "Task"("goalId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalCycle" ADD CONSTRAINT "GoalCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "GoalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
