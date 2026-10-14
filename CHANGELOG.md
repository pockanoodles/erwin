# Changelog

Erwin's changes are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). History from before the fork is in [FluidCalendar's changelog](https://github.com/dotnetfactory/fluid-calendar/blob/main/CHANGELOG.md).

## [Unreleased]

Erwin reads your calendar, your Canvas courses and your goals, then tells you the one thing to do next.

### Added

- **Focus:** a ranked queue of what to do next, a daily briefing, and a three-column desk with the work in the middle. Done, Skip and Later work from the keyboard.
- **Canvas sync:** courses, assignments, modules and files come in read-only, and the files are saved on your machine so doing the work does not start with a Canvas login.
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

### Removed

- The hosted-service code inherited from upstream: the `.open` and `.saas` file split, the feature flags, the waitlist and beta settings, the lifetime-access banner and the queue-based auto-schedule path.
- The SQLite import script (`migrate.js`) and the second Resend module.
- The Resend API key field in System settings, which nothing read, and the Daily Email Updates toggle, which promised an email nothing sends.
- The database tables and columns behind them, in migration `20261014120000_drop_upstream_saas`: `PendingWaitlist`, `Waitlist`, `BetaSettings`, `JobRecord`, `Subscription`, `SystemSettings.resendApiKey` and `NotificationSettings.dailyEmailEnabled`.
