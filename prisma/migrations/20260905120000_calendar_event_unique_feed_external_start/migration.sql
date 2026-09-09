-- De-duplicate CalendarEvent, then enforce one row per (feedId, externalEventId, start).
--
-- Background: CalDAV sync persists a recurring series as one `isMaster` row plus the
-- rows produced by expanding its RRULE. The expansion is inclusive of DTSTART, so the
-- series' first occurrence was written twice: once as the master row, once as an
-- instance row carrying the same feedId/externalEventId/start.
--
-- This migration must be safe on a database that already contains those duplicates.

-- Survivor per key: prefer the master row (it carries recurrenceRule and is the parent
-- of the instance rows), then the oldest, then a stable id tiebreak. Preferring the
-- master also avoids deleting a row that `masterEventId` cascades from.
CREATE TEMP TABLE "calendar_event_dedupe" AS
SELECT
  id,
  first_value(id) OVER (
    PARTITION BY "feedId", "externalEventId", "start"
    ORDER BY "isMaster" DESC, "createdAt" ASC, id ASC
  ) AS keep_id
FROM "CalendarEvent"
WHERE "externalEventId" IS NOT NULL;

-- 1. Re-point any instance whose master is about to be deleted at the surviving row,
--    so the ON DELETE CASCADE on masterEventId cannot take live instances with it.
UPDATE "CalendarEvent" e
SET "masterEventId" = d.keep_id
FROM "calendar_event_dedupe" d
WHERE e."masterEventId" = d.id
  AND d.id <> d.keep_id;

-- 2. Drop the now-redundant rows.
DELETE FROM "CalendarEvent" e
USING "calendar_event_dedupe" d
WHERE e.id = d.id
  AND d.id <> d.keep_id;

-- 3. A row must never be its own master (would be created only by a pathological
--    re-point above; cheap to assert and cheap to repair).
UPDATE "CalendarEvent" SET "masterEventId" = NULL WHERE "masterEventId" = id;

DROP TABLE "calendar_event_dedupe";

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_feedId_externalEventId_start_key" ON "CalendarEvent"("feedId", "externalEventId", "start");
