-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "rubric" JSONB;

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "termName" TEXT,
    "syllabusHtml" TEXT,
    "htmlUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "unlockAt" TIMESTAMP(3),
    "courseId" TEXT NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMaterial" (
    "id" TEXT NOT NULL,
    "canvasRef" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER,
    "indent" INTEGER NOT NULL DEFAULT 0,
    "htmlUrl" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "pageSlug" TEXT,
    "bodyHtml" TEXT,
    "fileCanvasId" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "fileUpdatedAt" TIMESTAMP(3),
    "localPath" TEXT,
    "downloadError" TEXT,
    "assignmentCanvasId" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,

    CONSTRAINT "CourseMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskMaterialLink" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,

    CONSTRAINT "TaskMaterialLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_userId_canvasId_key" ON "Course"("userId", "canvasId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseModule_courseId_canvasId_key" ON "CourseModule"("courseId", "canvasId");

-- CreateIndex
CREATE INDEX "CourseMaterial_moduleId_idx" ON "CourseMaterial"("moduleId");

-- CreateIndex
CREATE INDEX "CourseMaterial_assignmentCanvasId_idx" ON "CourseMaterial"("assignmentCanvasId");

-- CreateIndex
CREATE INDEX "CourseMaterial_fileCanvasId_idx" ON "CourseMaterial"("fileCanvasId");

-- CreateIndex
CREATE INDEX "CourseMaterial_pageSlug_idx" ON "CourseMaterial"("pageSlug");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMaterial_courseId_canvasRef_key" ON "CourseMaterial"("courseId", "canvasRef");

-- CreateIndex
CREATE INDEX "TaskMaterialLink_materialId_idx" ON "TaskMaterialLink"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMaterialLink_taskId_materialId_key" ON "TaskMaterialLink"("taskId", "materialId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMaterialLink" ADD CONSTRAINT "TaskMaterialLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMaterialLink" ADD CONSTRAINT "TaskMaterialLink_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CourseMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
