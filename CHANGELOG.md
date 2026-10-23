# Changelog

Erwin's changes are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). History from before the fork is in [FluidCalendar's changelog](https://github.com/dotnetfactory/fluid-calendar/blob/main/CHANGELOG.md).

## [Unreleased]

Erwin reads your calendar, your Canvas courses and your goals, then tells you the one thing to do next.

### Added

- **Focus:** a ranked queue of what to do next, a daily briefing, and a three-column desk with the work in the middle. Done, Skip and Later work from the keyboard.
- **Canvas sync:** courses, assignments, modules and files come in read-only, and the files are saved on your machine so doing the work does not start with a Canvas login.
- **Gradebook:** every assignment with your score, the class statistics when shared, grader comments, rubric marks and quiz rules (time limit, attempts, LockDown Browser), plus Canvas's course totals, an estimate where a course hides them, and what each letter takes on the remaining work. Migration `20261022220000_canvas_gradebook`.
- **Announcements and Canvas Inbox:** kept in full and readable in Erwin. Inbox threads are fetched without marking them read.
- **Activity:** each sync records what changed (new announcements, messages, files and assignments, moved due dates, posted grades, feedback, work gone missing) in one feed, with an unseen count in the top bar. `GET /api/erwin/activity?since=` lets a local tool follow it.
- **Courses page:** Activity, Grades, News and Library views, with an All tab beside the course tabs.
- **Goals and progress:** goals link to tasks and courses, and progress shows honest numbers with no streaks.
- **Calendar and tasks:** Google, Outlook and CalDAV calendars, task sync with Outlook and Google Tasks, auto-scheduling, subtasks, and deferred tasks.
- **Desktop app:** Electron around the same server, with an embedded database and no account or setup. It saves a copy of the database before any migration that changes it.
- **Self-host:** Docker Compose with Postgres and a background sync worker, or a single container with the in-process scheduler.
- **`npm run dev:local`:** the app on an embedded database with nothing else installed, and `--seed demo` for an example week.
- **Landing page:** kaitosoeno.com/erwin in English and Japanese.
- **Brand module:** the product name, URLs and support contact live in `src/lib/brand.ts`.

### Changed

- `PATCH /api/system-settings` accepts only the real settings fields and answers 400 for a bad value, instead of passing the request body to the database.
- Password reset email sends from the address in `EMAIL_FROM`. With `RESEND_API_KEY` set and no `EMAIL_FROM`, the server logs an error and sends nothing.
- Docker Compose needs `POSTGRES_PASSWORD`, has no default password, and publishes Postgres and Redis on 127.0.0.1 only. The default database user and name are now `erwin`.
- The background worker moved from `src/saas/jobs` to `src/worker`.
- Background sync runs on a plain timer in the worker process (or inside the app with `ERWIN_SCHEDULER=inprocess`). The worker no longer uses BullMQ, so Redis is gone from Docker Compose and from the requirements.
- Canvas syncs every 15 minutes instead of every 2 hours. Materials sync incrementally each time, with a full pass every 6 hours.
- Canvas creates a task for every assignment with something to hand in or a date to meet, including work graded before Erwin first saw it and assignments that unlock later. Undated participation lines and posted-grade placeholders stay in the gradebook only, and assignments Canvas removes are removed.
- Canvas work that's closed without a submission (`missed`), or that happens in class or in another tool once its date passes (`ended`), leaves Focus and the attention list instead of staying overdue.
- Focus's "if you miss this" projection reads the stored gradebook, weights groups the way Canvas's current score does, and no longer calls Canvas while the page loads.

### Fixed

- The background worker resolved `@/` imports one directory too high after it moved to `src/worker`, so a fresh build crashed on start.
- A 15-minute sync interval on a 15-minute tick skipped every other tick.
- BullMQ's job scheduler could stop scheduling for good after a worker restart that landed within one interval of the last run, which ended background sync without an error.

### Removed

- The `bullmq`, `ioredis` and `cron` dependencies, the Redis service in Docker Compose and `REDIS_URL`.

- The hosted-service code inherited from upstream: the `.open` and `.saas` file split, the feature flags, the waitlist and beta settings, the lifetime-access banner and the queue-based auto-schedule path.
- The SQLite import script (`migrate.js`) and the second Resend module.
- The Resend API key field in System settings, which nothing read, and the Daily Email Updates toggle, which promised an email nothing sends.
- The database tables and columns behind them, in migration `20261014120000_drop_upstream_saas`: `PendingWaitlist`, `Waitlist`, `BetaSettings`, `JobRecord`, `Subscription`, `SystemSettings.resendApiKey` and `NotificationSettings.dailyEmailEnabled`.
