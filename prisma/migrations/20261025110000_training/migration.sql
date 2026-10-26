-- Training module: routines someone repeats, and each session with its sets.
-- A routine's cadence becomes one workout task (Task.source = 'TRAINING').
-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "cadenceDays" DOUBLE PRECISION,
    "minutes" INTEGER NOT NULL DEFAULT 60,
    "plan" JSONB NOT NULL DEFAULT '[]',
    "lastDoneAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "note" TEXT,
    "ticked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutEntry" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "exercise" TEXT NOT NULL,
    "sets" INTEGER NOT NULL DEFAULT 1,
    "reps" INTEGER,
    "weight" DOUBLE PRECISION,

    CONSTRAINT "WorkoutEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_userId_archived_idx" ON "Routine"("userId", "archived");

-- CreateIndex
CREATE INDEX "Workout_routineId_at_idx" ON "Workout"("routineId", "at");

-- CreateIndex
CREATE INDEX "WorkoutEntry_workoutId_position_idx" ON "WorkoutEntry"("workoutId", "position");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutEntry" ADD CONSTRAINT "WorkoutEntry_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

