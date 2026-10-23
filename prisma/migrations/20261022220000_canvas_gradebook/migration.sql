-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "activitySince" TIMESTAMP(3),
ADD COLUMN     "applyGroupWeights" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentGrade" TEXT,
ADD COLUMN     "currentScore" DOUBLE PRECISION,
ADD COLUMN     "finalGrade" TEXT,
ADD COLUMN     "finalScore" DOUBLE PRECISION,
ADD COLUMN     "gradingScheme" JSONB,
ADD COLUMN     "materialsSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CourseMaterial" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "TaskProvider" ALTER COLUMN "syncIntervalMinutes" SET DEFAULT 15;

-- CreateTable
CREATE TABLE "CourseAssignmentGroup" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "dropLowest" INTEGER NOT NULL DEFAULT 0,
    "dropHighest" INTEGER NOT NULL DEFAULT 0,
    "neverDrop" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "courseId" TEXT NOT NULL,

    CONSTRAINT "CourseAssignmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAssignment" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER,
    "dueAt" TIMESTAMP(3),
    "unlockAt" TIMESTAMP(3),
    "lockAt" TIMESTAMP(3),
    "pointsPossible" DOUBLE PRECISION,
    "gradingType" TEXT,
    "submissionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "omitFromFinalGrade" BOOLEAN NOT NULL DEFAULT false,
    "htmlUrl" TEXT,
    "quizTimeLimit" INTEGER,
    "quizAllowedAttempts" INTEGER,
    "quizQuestionCount" INTEGER,
    "lockdownBrowser" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT 'unsubmitted',
    "submittedAt" TIMESTAMP(3),
    "attempt" INTEGER,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "secondsLate" INTEGER,
    "pointsDeducted" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "grade" TEXT,
    "gradedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "scoreStatistics" JSONB,
    "comments" JSONB,
    "rubricAssessment" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "courseId" TEXT NOT NULL,
    "groupId" TEXT,
    "taskId" TEXT,

    CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAnnouncement" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "author" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "htmlUrl" TEXT,
    "readInCanvas" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "CourseAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseConversation" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "messages" JSONB NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "CourseConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseActivity" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courseId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "materialId" TEXT,
    "announcementId" TEXT,
    "conversationId" TEXT,

    CONSTRAINT "CourseActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseAssignmentGroup_courseId_canvasId_key" ON "CourseAssignmentGroup"("courseId", "canvasId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAssignment_taskId_key" ON "CourseAssignment"("taskId");

-- CreateIndex
CREATE INDEX "CourseAssignment_groupId_idx" ON "CourseAssignment"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAssignment_courseId_canvasId_key" ON "CourseAssignment"("courseId", "canvasId");

-- CreateIndex
CREATE INDEX "CourseAnnouncement_courseId_postedAt_idx" ON "CourseAnnouncement"("courseId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAnnouncement_courseId_canvasId_key" ON "CourseAnnouncement"("courseId", "canvasId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseConversation_courseId_canvasId_key" ON "CourseConversation"("courseId", "canvasId");

-- CreateIndex
CREATE INDEX "CourseActivity_courseId_createdAt_idx" ON "CourseActivity"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseActivity_createdAt_idx" ON "CourseActivity"("createdAt");

-- CreateIndex
CREATE INDEX "CourseActivity_seenAt_idx" ON "CourseActivity"("seenAt");

-- CreateIndex
CREATE INDEX "CourseActivity_assignmentId_idx" ON "CourseActivity"("assignmentId");

-- CreateIndex
CREATE INDEX "CourseActivity_materialId_idx" ON "CourseActivity"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseActivity_courseId_dedupeKey_key" ON "CourseActivity"("courseId", "dedupeKey");

-- CreateIndex
CREATE INDEX "CourseMaterial_parentId_idx" ON "CourseMaterial"("parentId");

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CourseMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignmentGroup" ADD CONSTRAINT "CourseAssignmentGroup_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CourseAssignmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAnnouncement" ADD CONSTRAINT "CourseAnnouncement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseConversation" ADD CONSTRAINT "CourseConversation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseActivity" ADD CONSTRAINT "CourseActivity_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseActivity" ADD CONSTRAINT "CourseActivity_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CourseAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseActivity" ADD CONSTRAINT "CourseActivity_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CourseMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseActivity" ADD CONSTRAINT "CourseActivity_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "CourseAnnouncement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseActivity" ADD CONSTRAINT "CourseActivity_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CourseConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Canvas providers still on the old 120-minute default move to 15. Nothing in
-- the UI sets this, so 120 means the default rather than a choice.
UPDATE "TaskProvider" SET "syncIntervalMinutes" = 15 WHERE "type" = 'CANVAS' AND "syncIntervalMinutes" = 120;
