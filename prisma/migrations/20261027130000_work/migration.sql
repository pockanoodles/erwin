-- Work module: jobs, their shifts and contacts. Shifts were calendar events
-- on a LOCAL feed per schedule source ("ops-shifts:<source>"); each such feed
-- becomes a job, each of its events a shift linked back to it, and the
-- calendar keeps showing the same events. A pay period's hours become one
-- "Submit hours" task (Task.source = 'WORK') once a job has a pay period.
-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#E8590CFF',
    "hourlyRate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payPeriodDays" INTEGER,
    "payPeriodStart" DATE,
    "timesheetDueDays" INTEGER NOT NULL DEFAULT 0,
    "timesheetsFrom" DATE,
    "weeklyCapHours" DOUBLE PRECISION,
    "links" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "importKey" TEXT,
    "feedId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "importKey" TEXT,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "role" TEXT,
    "supervisor" TEXT,
    "details" TEXT,
    "dropped" BOOLEAN NOT NULL DEFAULT false,
    "workedStart" TIMESTAMP(3),
    "workedEnd" TIMESTAMP(3),
    "note" TEXT,
    "loggedAt" TIMESTAMP(3),
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobContact" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "importKey" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_feedId_key" ON "Job"("feedId");

-- CreateIndex
CREATE INDEX "Job_userId_archived_idx" ON "Job"("userId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Job_userId_importKey_key" ON "Job"("userId", "importKey");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_eventId_key" ON "Shift"("eventId");

-- CreateIndex
CREATE INDEX "Shift_jobId_start_idx" ON "Shift"("jobId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_jobId_importKey_key" ON "Shift"("jobId", "importKey");

-- CreateIndex
CREATE INDEX "JobContact_jobId_position_idx" ON "JobContact"("jobId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "JobContact_jobId_importKey_key" ON "JobContact"("jobId", "importKey");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "CalendarFeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContact" ADD CONSTRAINT "JobContact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Every shift feed ops' schedule import made becomes that source's job.
INSERT INTO "Job" ("id", "userId", "name", "color", "importKey", "feedId", "updatedAt")
SELECT f."id", f."userId", f."name", COALESCE(f."color", '#E8590CFF'),
       substring(f."url" from length('ops-shifts:') + 1), f."id", CURRENT_TIMESTAMP
FROM "CalendarFeed" f
WHERE f."type" = 'LOCAL' AND f."url" LIKE 'ops-shifts:%' AND f."userId" IS NOT NULL;

-- Each of its events becomes a shift. The import keyed them "<source>:<key>"
-- and wrote "<role> · Supervisor: <name>" on the description's first line.
INSERT INTO "Shift" ("id", "jobId", "importKey", "title", "start", "end", "location",
                     "role", "supervisor", "details", "eventId", "updatedAt")
SELECT e."id", j."id",
       regexp_replace(e."externalEventId", '^[^:]*:', ''),
       e."title", e."start", e."end", e."location",
       CASE WHEN split_part(split_part(COALESCE(e."description", ''), E'\n', 1), ' · ', 1) LIKE 'Supervisor:%' THEN NULL
            ELSE NULLIF(btrim(split_part(split_part(COALESCE(e."description", ''), E'\n', 1), ' · ', 1)), '')
       END,
       NULLIF(btrim(substring(e."description" from 'Supervisor: ([^\n·]+)')), ''),
       e."description", e."id", CURRENT_TIMESTAMP
FROM "CalendarEvent" e
JOIN "Job" j ON j."feedId" = e."feedId"
WHERE e."externalEventId" IS NOT NULL;

-- Work is off by default, so anyone whose shifts it now holds keeps it on,
-- after every module already in their rail.
INSERT INTO "UserModule" ("userId", "moduleId", "enabled", "position", "updatedAt")
SELECT j."userId", 'work', true,
       GREATEST(5, COALESCE((SELECT MAX(m."position") + 1 FROM "UserModule" m WHERE m."userId" = j."userId"), 0)),
       CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "userId" FROM "Job") j
ON CONFLICT ("userId", "moduleId") DO NOTHING;
