-- Erwin Focus: display % of final grade without pool-normalized distortion
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "gradeWeightPercent" DOUBLE PRECISION;
