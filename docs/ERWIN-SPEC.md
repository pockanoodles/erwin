# Erwin — implementation tracker

Authoritative product/architecture spec: see the May 1, 2026 technical specification provided in-project / chat (Canvas + CalDAV + ranking engine).

## Migration

Apply new Prisma migration when the DB is up:

```bash
npx prisma migrate deploy
```

Migration folder: `prisma/migrations/20260501140000_erwin_foundation/`

## Implemented (foundation)

- [x] Schema: `TaskInteraction`, `RankerState`, Erwin fields on `Task` / `TaskProvider`, `CalendarEvent.transparency`
- [x] Canvas read-only sync → `Task` rows (`src/lib/canvas/sync-canvas-tasks.ts`)
- [x] API: `/api/erwin/canvas` (GET status, POST save | validate | sync)
- [x] Settings UI: Canvas LMS card under Task Sync
- [x] Stage 1 ranking stub: `src/lib/erwin/rank-stage1.ts` (DANGER-first sort, briefing counts)
- [x] Focus tab: `ErwinFocusMode` — briefing header, one-task view, Done/Skip, `TaskInteraction` logging, up-next preview; nav **Focus | Calendar | Progress | Tasks**
- [x] Progress tab: `/progress`, `/api/erwin/progress/summary`
- [x] Package rename: `package.json` `name` → `erwin`

## Next (from spec)

- [ ] BullMQ jobs: adaptive Canvas polling, CalDAV polling, GitHub
- [ ] CalDAV CTag-optimized sync + availability engine (busy/free)
- [ ] Full Stage 1 ranking (deadline pressure, effort fit, urgency tiers, personal filler lane)
- [ ] Stage 2 learned ranker + `RankerState` initialization
- [ ] Focus tab / daily briefing UX per spec
- [ ] Phase 0 cleanup: remove Google/Outlook calendar OAuth paths when CalDAV-only is verified (optional feature-flag first)
