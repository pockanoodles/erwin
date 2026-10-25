-- Canvas's facts about an assignment live on its gradebook row, which
-- Courses owns; Task keeps only what any task has. The row already holds the
-- course, submission state, points, grading and submission types; it gains
-- the two it lacked, copied from the task it backs. The Canvas sync rewrites
-- all of them on its next run anyway.
ALTER TABLE "CourseAssignment" ADD COLUMN "gradeWeightPercent" DOUBLE PRECISION,
ADD COLUMN "rubric" JSONB;

UPDATE "CourseAssignment" AS ca
SET "gradeWeightPercent" = t."gradeWeightPercent",
    "rubric" = t."rubric"
FROM "Task" AS t
WHERE ca."taskId" = t."id";

ALTER TABLE "Task" DROP COLUMN "assignmentGroupName",
DROP COLUMN "courseId",
DROP COLUMN "courseName",
DROP COLUMN "gradeWeightPercent",
DROP COLUMN "gradingType",
DROP COLUMN "groupWeight",
DROP COLUMN "omitFromFinalGrade",
DROP COLUMN "pointsPossible",
DROP COLUMN "rubric",
DROP COLUMN "submissionStatus",
DROP COLUMN "submissionTypes";
