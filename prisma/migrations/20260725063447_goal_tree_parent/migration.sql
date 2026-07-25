-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "parentGoalId" TEXT;

-- CreateIndex
CREATE INDEX "Goal_parentGoalId_idx" ON "Goal"("parentGoalId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentGoalId_fkey" FOREIGN KEY ("parentGoalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
