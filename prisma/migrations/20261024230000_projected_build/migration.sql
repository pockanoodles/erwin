-- The vault's map sets a hex's Build when ops' goal sync sends one.
ALTER TABLE "GoalCycle" ADD COLUMN "buildProjected" BOOLEAN NOT NULL DEFAULT false;
