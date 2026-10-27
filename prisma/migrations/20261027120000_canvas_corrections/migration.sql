-- Canvas corrections: where Canvas is wrong about an assignment, applied by
-- sync on top of what Canvas says. Each assignment row records what was applied.
-- AlterTable
ALTER TABLE "CourseAssignment" ADD COLUMN "corrections" JSONB;

-- CreateTable
CREATE TABLE "CanvasCorrection" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "assignmentCanvasId" TEXT,
    "nameMatch" TEXT,
    "submissionType" TEXT,
    "field" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "canvasValue" TEXT,
    "retiredAt" TIMESTAMP(3),
    "retiredNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvasCorrection_courseId_idx" ON "CanvasCorrection"("courseId");

-- AddForeignKey
ALTER TABLE "CanvasCorrection" ADD CONSTRAINT "CanvasCorrection_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
