# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Erwin's own releases start at 1.0.0. The entries from [1.3.0] down are FluidCalendar's, from before the fork.

## [Unreleased]

### Fixed

- **Courses sheet Kind column:** module bands and subheaders no longer span into Kind — titles stay under Title when Kind is empty, so the column lines up with PAGE/TASK/QUIZ rows.

### Added

- **Field kit:** a palette sampled from Hamilton's Khaki Field watches (`brand/tokens.css`), with one rust accent that marks what is happening now. Michroma sets titles and readouts, Chivo sets reading text, and Chivo Mono sets times and labels. Buttons are plates with two cut corners, and a selection gets ink corner brackets. `brand/BRAND.md` is the spec, and `scripts/brand-assets.mjs` renders every icon from `brand/`.
- **Desktop app (`desktop/`):** Electron around the same Next server, on PGlite (Postgres compiled to WebAssembly) served over the Postgres wire protocol, so the Prisma client runs unchanged. A download needs no account and no setup. The app saves a copy of the database before any migration that changes it and runs background sync on a timer in the server process (`ERWIN_SCHEDULER=inprocess`).
- **`npm run dev:local`:** the app on PGlite with nothing else installed, with its database in `.local/`. `--seed demo` fills it with one example week (`scripts/demo/seed.ts`), and `--reset` starts over.
- **Landing page (`site/`):** kaitosoeno.com/erwin in English and Japanese, a static export served by a Cloudflare Worker.
- **Release pipeline:** a version tag builds every desktop package and drafts a GitHub Release (`release.yml`), and the server image goes to GHCR (`docker.yml`). `packaging/` holds the store and package-manager manifests, and its README is the release runbook.
- **Focus desk:** Focus is a three-column desk (context, work, grade book) with the next two tasks as a tape. Done and Skip stay, Later defers until end of day, and subtasks on the focused task can be checked off. `D` / `S` / `L` work when focus is open.
- **Density pass:** Tasks page's Lord filter moved from a 224px side column to a spreadsheet-tab strip along the bottom (`LordSidebar`); the Sheet view's grid now continues past the last row/column instead of dead-ending into blank background (`TaskSheet`); Bosses list view drops its `max-w-5xl` cap; Tasks List rows put title and meta on one line instead of stacking, so every row is a uniform height regardless of how much meta it carries. Removed orphaned `ProjectSidebar`, `FocusTaskCard`, `UpNext`, and unused `--chart-*` tokens left over from earlier iterations.
- **Task list modes (tududi adaptation phase 4):** All / Today / Upcoming / Someday query the `/tasks` inventory by due date (`?mode=`). Today splits Overdue / Today; Upcoming groups the next 7 days. Not Focus — no ranking, no suggested lane. Cmdk entries for these views still need confirmation.
- **Task subtasks (tududi adaptation phase 3):** one-level `parentTaskId` + `order`. Nested checklist under TaskRow with progress (`2 of 5`) and Enter-to-add. Children stay out of Focus, auto-schedule, and the board. Canvas sync does not create subtasks; local children are `skipSync`. Completing a child does not auto-complete the parent.
- **Task defer (tududi adaptation phase 2):** `postponedUntil` is the hide-until stamp (Focus queue, `/tasks` list, auto-schedule). TaskRow Defer writes it with Later today / Tomorrow / Next week presets; `startDate` stays the scheduler/Outlook earliest-work field. Deferred tasks are hidden from Tasks unless **Show deferred** is on or you search. Modal has a Defer until field.
- **Month view event display (upstream #175):** timed events show their start time and calendar color in the month and multi-month grids (`calendar-event-display.ts`, `CalendarEventContent`).
- **Focus Mode & Daily Briefing (docs/focus-mode.md):** `GET /api/erwin/focus/briefing`, first-open-of-day full briefing (`DailyBriefing`), `localStorage` gate (`erwin-last-briefing`), collapsible `CompactBriefing`, enriched queue (`countdownHuman`, `gradeImpactPercent`, `gradeProjection`, `effortEstimate`, `lastSkippedAgo`), `POST /api/erwin/focus/interact` alias, Canvas weighted grade projection helper (`grade-projection.ts`), `gradeWeightPercent` on `Task`, `FocusTaskCard` / `UpNext` / bottom-sheet `QuickAdd`, framer-motion card transitions; default post-auth navigation to `/focus` (sign-in client redirect, setup completed redirect, existing session redirect)
- **Full technical spec in-repo:** `docs/ERWIN-SPEC.md` now includes the complete May 1, 2026 Erwin technical specification plus a living implementation tracker.
- **Stage 1 ranking (spec §5.2):** sigmoid deadline pressure, effort fit vs current slot, weighted base score (0.35/0.45/0.20), pool-normalized grade impact, long-horizon visibility boost, personal filler lane when Canvas is DANGER/HIGH, skip-spiral DANGER escalation; Focus API returns `urgencyTier` and `baseScore`.
- **Focus UX:** calendar `slotNarrative` in the daily briefing header; floating quick-add (manual `LOCAL` task, 30m default); authenticated home when homepage is disabled redirects to `/focus`.
- **Canvas sync:** per-user normalization of `gradeImpactScore` to 0–1 after each sync; BullMQ Canvas polling uses 30 min when any open task is due within 48h, else the provider `syncIntervalMinutes` (default 2h).

### Fixed

- **One Prisma client per process:** the client is cached on `globalThis` in production too, because a production Next server bundles `src/lib/prisma.ts` into several layers and each one built its own connection pool.
- **Calendar event labels:** timed events pick a light or dark label by WCAG contrast against their calendar color (`readableLabelOn`), so labels stay readable on dark feeds.
- **The Ladder:** goals can be edited again, unless they are projected in from a vault (`managedExternally` on the goals overview).
- **Focus and Today copy:** counts take the right plural ("1 task"), the doubled "in in 3h" is gone, and a fresh install's Today screen offers Connect Canvas, Add a calendar and Add a task.
- **Turbopack dev white screen:** `next dev --turbopack` was bundling `@/lib/logger/server` (and Prisma's `defineExtension`) into the browser. The existing swap only ran under Webpack. A browser-only Turbopack alias points that import at `server.browser.ts`.
- **Upstream port round 1 (2026-07)** — robustness fixes from `dotnetfactory/fluid-calendar` upstream, hand-applied to the fork:
  - Google OAuth token expiry uses the absolute `expiry_date` rather than a recomputed offset (upstream #196; `token-manager.ts`, `google-calendar.ts`)
  - Task "hide upcoming" filter now matches the badge count; priority/energy columns sort by rank (upstream #109/#131/#180; `task-list-utils.ts`, `TaskList`, `TaskRow`)
  - Auto-Schedule time dropdowns honor the 12h/24h preference (`AutoScheduleSettings`, `autoSchedule.ts`)
  - CalDAV: correct `VALUE=DATE` all-day handling and timed events carrying `TZID`/`VTIMEZONE` (upstream #100/#135; `caldav-calendar.ts`, `caldav-vtimezone.ts`, with unit tests)
  - CalDAV: connection/TLS failures reported distinctly from auth failures (upstream #206; `available-calendars-error.ts`, `AvailableCalendars`)
  - Google: single-occurrence delete removes only the clicked instance, not the series (upstream #199; `calendar/google/route.ts`)
- **Task scheduling after create:** `scheduleAllTasksForUser` no longer fails when `AutoScheduleSettings` is missing — creates the same weekday 9–17 defaults as setup migration so `POST /api/tasks/schedule-all` succeeds for new users
- **Zustand + `localStorage` on `/` (500):** all `persist` stores use `ssrSafeJsonStorage` so SSR and Node’s experimental / broken `localStorage` (`getItem is not a function`) no longer crash; `CommandPaletteHint` guards `localStorage` access; `src/instrumentation.ts` replaces broken Node `globalThis.localStorage` at server startup; `getClientLocalStorage` also checks `globalThis.localStorage`
- **Worker + Prisma:** `start:worker` now loads project `.env` first (`src/saas/jobs/load-env.ts` + `dotenv`) so `DATABASE_URL=...@localhost:5432` applies — plain `node` did not read `.env`, which led to wrong DB host (`db:5432`) / connection failures
- **`.env.example`:** document `DATABASE_URL` — use `localhost` for host-side dev (`npm run dev`, Prisma CLI); use hostname `db` only from containers on the Compose network
- **`redis:up`:** use root `docker-compose.yml` (added `redis:7-alpine` on port 6379); removed reference to missing `docker-compose.saas.yml`

### Added

- **BullMQ worker (Phase C):** `src/saas/jobs/worker.ts` runs repeatable Canvas + CalDAV sync via `src/lib/erwin/job-sync-runner.ts` (`module-alias` resolves `@/` at runtime); `npm run build:worker` copies `worker-with-aliases.js`; configure `REDIS_URL`, optional `ERWIN_BACKGROUND_SYNC_INTERVAL_MS` (default 15 min), `ERWIN_CALDAV_POLL_INTERVAL_MINUTES` (default 15)
- **Erwin availability (Phase A):** CalDAV `TRANSP`/`STATUS` → `CalendarEvent.transparency` + `status`; PROPFIND `getctag` short-circuit on sync (skipped when unchanged); `computeErwinAvailabilitySummary` + `GET /api/erwin/availability`; focus queue filters tasks when estimated duration exceeds current/next free window during work hours
- **Focus (Erwin):** `/api/erwin/focus/queue` + `/api/erwin/focus/interaction` — Stage 1 ranked queue, daily briefing header, Done/Skip with `TaskInteraction` context snapshots (`timeOfDay`, `dayOfWeek`, `hour`, `tasksCompletedToday`)
- **Progress tab:** `/progress` + `/api/erwin/progress/summary`; main nav order **Focus | Calendar | Progress | Tasks**; command palette **Go to Progress** (`gp`)
- **Erwin foundation:** Prisma models `TaskInteraction` and `RankerState`; extended `Task`, `TaskProvider`, and `CalendarEvent` for Canvas sync and ranking metadata
- **Canvas LMS (read-only):** `src/lib/canvas/*`, `POST/GET /api/erwin/canvas`, and Settings → Task Sync → "Canvas LMS (Erwin)" card (token validate, save, sync assignments into `Task`)
- **Ranking stub:** `src/lib/erwin/rank-stage1.ts` (deterministic filter + ordering placeholder for full spec Stage 1)
- Added `scripts/create-user.js` CLI utility to create a local credentials user with a hashed password stored in `Account.id_token`
- Added a button to mark tasks as completed directly from the task quick view popup
- Added visual indicator for externally synced tasks in task list view
- Added Stripe configuration file (`src/lib/stripe.saas.ts`) for SAAS payment processing
- Lifetime access purchase feature
  - Added Stripe integration for one-time payments
  - Implemented early bird 50% discount for first 50 purchases
  - Added lifetime access status tracking for users
  - Created webhook handler for Stripe events
  - Added server actions and API routes for purchase flow
- Lifetime access subscription plan with special early bird pricing
- Server actions for handling lifetime access purchases
- Early bird discount for first 50 lifetime subscribers ($200 instead of $400)
- Lifetime Access subscription plan with early bird pricing
  - Early bird offer: $200 for first 50 subscribers
  - Regular price: $400 after early bird period
  - Includes all Pro features with perpetual access
- Lifetime subscription success page with modern design and animations
- New reusable PageHeader component for consistent page headers
- Enhanced payment success flow with session verification
- New success page for lifetime subscription purchases
- API endpoint to verify Stripe checkout sessions
- Refactored the lifetime subscription success page (`src/app/(saas)/subscription/lifetime/success/page.tsx`) to use the new pattern for `searchParams` and `params` as Promise types, updating usages accordingly.
- Added a password setup page at /subscription/lifetime/setup-password for new users after successful payment (SAAS only).
- Updated the 'Set Up Your Account' button on the lifetime success page to redirect to the password setup page.
- The 'Set Up Your Account' button now sends name and email in query params to the password setup page, which displays them if present.
- Implemented backend API route and service for password setup at /subscription/lifetime/setup-password/api (SAAS only).
- Added client service to call the backend API for password setup.
- Integrated password setup form with the backend using Tanstack Query, including loading, error, and success states.
- Made `/subscription/lifetime/success` route public in middleware so it no longer requires authentication after successful payment.
- Made `/subscription/lifetime/setup-password` route public in middleware so users can set their password after payment without authentication.
- Enhanced lifetime subscription success page with automatic user verification and redirection
- Added subscription status verification and automatic updates for existing users
- Improved payment verification with early bird discount detection
- Updated LifetimeSuccessPage and LifetimeSuccessClient to show 'Go to login' or 'Go to Calendar' for existing users after successful lifetime subscription payment, based on whether the user is logged in or not. The setup button is now only shown for new users.
- Added a dismissible "Buy Lifetime Access" banner at the top of the main calendar/dashboard view for SAAS users who have not purchased lifetime access. The banner links to /beta for payment.
- The "Upgrade to Lifetime Access" banner is now only shown if the user does not have a lifetime subscription. Added `/api/subscription/lifetime/status` endpoint for this check.
- Fixed "Upgrade to Lifetime Access" banner to remain hidden initially until verification confirms user doesn't have lifetime access, preventing banner flash for lifetime subscribers
- Added Asia/Karachi to the timezone options in user settings
- Improved calendar rendering performance with Server Components
  - Added server-side pre-fetching of calendar feeds and events data
  - Modified client components to hydrate with server-fetched data
  - Reduced client-side data loading operations and API calls
  - Eliminated loading delay for initial calendar view rendering
- Updated application logo to use SVG format instead of PNG for better quality
  - Replaced inline SVG calendar icons with the logo.svg file
  - Updated favicon configuration to use the SVG logo
  - Added SVG icon support in metadata
  - Made logo background transparent for better display on different colored backgrounds
  - Optimized logo viewBox for better visibility at small sizes in browser tabs
  - Added explicit size hints in metadata for better browser rendering
  - Added logo to main navigation bar with app name for better branding

### Changed

- Replaced the native password-hashing package with `bcryptjs` across auth flows, scripts, and dependencies to avoid runtime crashes in environments that skip install scripts
- `Dockerfile`: development stage runs `next dev` with `--hostname 0.0.0.0` for Docker port mapping; production builder fails fast if core source files are missing from the build context
- `docker-compose.yml`: app image builds with `target: development` so Compose uses the dev stage (no production `next build` inside the image; runs `npm run dev` after entrypoint)
- `docker-compose.yml`: app service now builds from the local `Dockerfile` instead of pulling `eibrahim/fluid-calendar:latest`
- Removed "Upcoming:" prefix from due dates in task views to reduce confusion with the "upcoming" label used for tasks with future start dates
- Updated future task detection to consider tasks as "upcoming" only if they are scheduled for tomorrow or later
- Added new `isFutureDate` utility function in date-utils
- Improved date formatting in task views to consistently show "Upcoming" label for future tasks
- Fixed task overdue check to not mark today's tasks as overdue
- Modified auto-scheduling to exclude tasks that are in progress, preventing them from being automatically rescheduled
- Updated User model to track lifetime access status
- Added new LifetimeAccessPurchase model for purchase tracking
- Updated success URL in checkout session to include session ID
- Improved UX for payment success confirmation
- Updated lifetime subscription checkout to use Stripe price IDs instead of inline product data
- Added new environment variables:
  - `STRIPE_LIFETIME_EARLY_BIRD_PRICE_ID`: Price ID for early bird lifetime access
  - `STRIPE_LIFETIME_REGULAR_PRICE_ID`: Price ID for regular lifetime access
- Updated verifyPaymentStatus to include additional payment information
- Improved error handling and logging in subscription flow
- Improved SAAS/open source code separation:
  - Renamed subscription-related files to include `.saas.ts` extension:
    - `/src/lib/actions/subscription.ts` → `/src/lib/actions/subscription.saas.ts`
    - `/src/lib/services/subscription.ts` → `/src/lib/services/subscription.saas.ts`
    - `/src/lib/hooks/useSubscription.ts` → `/src/lib/hooks/useSubscription.saas.ts`
    - `/src/app/api/subscription/lifetime/route.ts` → `/src/app/api/subscription/lifetime/route.saas.ts`
    - `/src/app/api/subscription/lifetime/status/route.ts` → `/src/app/api/subscription/lifetime/status/route.saas.ts`
    - `/src/app/api/subscription/lifetime/verify/route.ts` → `/src/app/api/subscription/lifetime/verify/route.saas.ts`
    - `/src/app/(saas)/subscription/lifetime/success/page.tsx` → `/src/app/(saas)/subscription/lifetime/success/page.saas.tsx`
  - Updated all imports referencing these files to use the new paths
  - Created separate implementations of components with SAAS-specific code:
    - Split `LifetimeAccessBanner` into `.saas.tsx` and `.open.tsx` versions
    - Modified Calendar component to use dynamic imports based on `isSaasEnabled` flag
    - Removed direct SAAS imports from common components

### Fixed

- Fixed settings integration status to treat Google/Outlook credentials from environment variables as configured (fallback when SystemSettings entries are empty)
- Avoid eager `googleapis` imports at module load (lazy `import("googleapis")` in `src/lib/google.ts`, Google calendar helpers, and Google task provider) to prevent `TypeError: Cannot read properties of undefined (reading 'prototype')` during `next build` page data collection
- Improved all-day event UI by removing time selection when "All day" is checked, showing only date picker instead
- Fixed Google Calendar event deletion by adding missing userId parameter for authentication
- Fixed Outlook task sync issues with recurring tasks
- Fixed Caldav feed failing to add when syncToken is an integer
- Fixed: Updated Stripe checkout session success_url in lifetime subscription API to use double curly braces ({{CHECKOUT_SESSION_ID}}) so users are redirected to the success page after payment.
- Fixed lifetime subscription error toast to show the actual error message ("User already has lifetime access") instead of generic "request failed with status code 400" message.
- Fixed name input in account setup page after payment to allow users to enter their complete name without the input disappearing after first character.
- Fixed infinite login redirect loop in staging environment by:
  - Correcting the login URL from "/login" to "/auth/signin" in lifetime success page
  - Adding explicit handling in middleware to redirect "/login" to the correct authentication route
  - Preventing redirect loops between /auth/signin and /setup pages by improving middleware and setup check logic
  - Adding special handling in middleware to detect and break circular redirects
- Fixed edge case where sign-in button remained visible after user logged in by adding proper session loading state handling in UserMenu component
- Fixed calendar page authentication to use JWT tokens instead of session-based authentication, maintaining consistency with the rest of the application
- Fixed authentication in subscription API routes by replacing session-based auth with JWT tokens:
  - Updated `/api/subscription/lifetime/status` to use getToken instead of getServerSession
  - Updated `/api/subscription/lifetime/verify` to use getToken instead of getServerSession
  - Updated `/subscription/lifetime/success` page to use JWT token authentication
- Fixed all linting errors related to usage of 'any' in API routes for subscription lifetime status and verify endpoints.
- Refactored usage of getToken in (saas) subscription lifetime success page and API routes to use NextRequest and proper cookie handling.
- Replaced console.log with logger.error in (common)/calendar/page.tsx for proper logging.

### Removed

## [1.3.0] 2025-03-25

### Added

- Comprehensive bidirectional task synchronization system with support for Outlook
  - Field mapping system for consistent task property synchronization
  - Recurrence rule conversion for recurring tasks
  - Intelligent conflict resolution based on timestamps
  - Support for task priorities and status synchronization
- Password reset functionality with email support for both SAAS and open source versions
- Smart email service with queued (SAAS) and direct (open source) delivery options
- System setting to optionally disable homepage and redirect to login/calendar
- Daily email updates for upcoming meetings and tasks (configurable)
- Resend API key management through SystemSettings

### Changed

- Enhanced task sync manager for true bidirectional synchronization
- Improved date and timezone handling across calendar and task systems
- Moved sensitive credentials from environment variables to SystemSettings
- Replaced Google Fonts CDN with self-hosted Inter font
- Updated API routes to follow NextJS 15 conventions
- Split task sync route into SAAS and open source versions
  - Moved background job-based sync to `route.saas.ts`
  - Created synchronous version in `route.open.ts` for open source edition

### Fixed

- Multiple task synchronization issues:
  - Prevented duplicate task creation in Outlook
  - Fixed task deletion synchronization
  - Resolved bidirectional sync conflicts
  - Fixed task mapping and direction issues
- All-day events timezone and display issues
- Various TypeScript and linter errors throughout the task sync system

### Removed

- Legacy one-way Outlook task import system and related components
- OutlookTaskListMapping model in favor of new TaskListMapping
- RESEND_API_KEY from environment variables

## [1.2.3]

### Added

- Added task start date feature to specify when a task should become active
  - Tasks with future start dates won't appear in focus mode
  - Auto-scheduling respects start dates, not scheduling tasks before their start date
  - Visual indicators for upcoming tasks in task list view
  - Filter option to hide upcoming tasks
  - Ability to sort and filter by start date
- Added week start day setting to Calendar Settings UI to allow users to choose between Monday and Sunday as the first day of the week
- Expanded timezone options in user settings to include a more comprehensive global list fixes #68
- Bulk resend invitations functionality for users with INVITED status
- Added "Resend Invitation" button to individual user actions in waitlist management

### Changed

- Updated email templates to use "FluidCalendar" instead of "Fluid Calendar" for consistent branding
- Refactored task scheduling logic into a common service to reduce code duplication
  - Created `TaskSchedulingService` with shared scheduling functionality
  - Updated both API route and background job processor to use the common service
- Improved SAAS/open source code separation
  - Moved SAAS-specific API routes to use `.saas.ts` extension
  - Renamed NotificationProvider to NotificationProvider.saas.tsx
  - Relocated NotificationProvider to SAAS layout for better code organization
  - Updated client-side code to use the correct endpoints based on version

### Fixed

- Fixed type errors in the job retry API by using the correct compound unique key (queueName + jobId)
- Fixed database connection exhaustion issue in task scheduling:
  - Refactored SchedulingService to use the global Prisma instance instead of creating new connections
  - Updated CalendarServiceImpl and TimeSlotManagerImpl to use the global Prisma instance
  - Added proper cleanup of resources in task scheduling API route
  - Resolved "Too many database connections" errors in production

### Technical Debt

- Added proper TypeScript types to replace `any` types
- Added eslint-disable comments only where absolutely necessary
- Fixed linter and TypeScript compiler errors
- Improved code maintainability with better type definitions
- Added documentation for the job processing system
- Standardized error handling across the codebase

### Removed

- Separate one-way sync methods in favor of a more efficient bidirectional approach

## [1.2.1] 2025-03-13

### Added

- Added login button to SAAS home page that redirects to signin screen or app root based on authentication status
- Added SessionProvider to SAAS layout to support authentication state across SAAS pages
- Added pre-commit hooks with husky and lint-staged to run linting and type checking before commits

### Changed

- Removed Settings option from the main navigation bar since it's already available in the user dropdown menu
- Improved dark mode by replacing black with dark gray colors for better visual comfort and reduced contrast

### Fixed

- Fixed event title alignment in calendar events to be top-aligned instead of vertically centered
- Removed minimum height constraint for all-day events in WeekView and DayView components to improve space utilization
- Made EventModal and TaskModal content scrollable on small screens to ensure buttons remain accessible

## [1.2.0] 2025-03-13

### Added

- Added background job processing system with BullMQ
  - Implemented BaseProcessor for handling job processing
  - Added DailySummaryProcessor for generating and sending daily summary emails
  - Added EmailProcessor for sending emails via Resend
  - Created job tracking system to monitor job status in the database
- Added admin interface for job management
  - Created admin jobs page with statistics and job listings
  - Added ability to trigger daily summary emails for testing
  - Implemented toast notifications for user feedback
- Added Toaster component to the saas layout and admin layout
- Added Redis configuration for job queues
- Added Prisma schema updates for job records
- Added worker process for background job processing
  - Created worker.ts and worker.cjs for running the worker process
  - Added run-worker.ts script for starting the worker
- Added Kubernetes deployment configuration for the worker
- Added Docker configuration for the worker
- Added date utilities for handling timezones in job processing
- Added maintenance job system for database cleanup
  - Implemented MaintenanceProcessor for handling system maintenance tasks
  - Added daily scheduled job to clean up orphaned job records
  - Created cleanup logic to mark old pending jobs as failed
- Centralized email service that uses the queue system for all email sending
- Task reminder processor and templates for sending task reminder emails
- Email queue system for better reliability and performance

### Fixed

- Fixed TypeScript errors in the job processing system:
  - Replaced `any` types with proper type constraints in BaseProcessor, job-creator, and job-tracker
  - Added proper type handling for job data and results
  - Fixed handling of undefined values in logger metadata
  - Added proper error handling for Prisma event system
  - Fixed BullMQ job status handling to use synchronous properties instead of Promise-returning methods
  - Added proper null fallbacks for potentially undefined values
  - Fixed type constraints for job data interfaces
  - Added proper type casting with eslint-disable comments where necessary
- Fixed meeting and task utilities to use proper date handling
- Fixed worker deployment in CI/CD pipeline
- Fixed job ID uniqueness issues by implementing UUID generation for all queue jobs
  - Resolved unique constraint violations when the same job ID was used across different queues
  - Replaced console.log calls with proper logger usage in worker.ts
- Fixed job tracking reliability issues
  - Reordered operations to create database records before adding jobs to the queue
  - Improved error handling and logging for job tracking operations
  - Added automated cleanup for orphaned job records
- Improved error handling in email sending process
- Reduced potential for rate limiting by queueing emails

### Changed

- Updated job tracking system to be more robust:
  - Improved error handling in job tracker
  - Added better type safety for job data and results
  - Enhanced logging with proper null fallbacks
  - Improved job status detection logic
  - Changed job creation sequence to ensure database records exist before processing begins
  - Added daily maintenance job to clean up orphaned records
- Updated GitHub workflow to include worker deployment
- Updated Docker Compose configuration to include Redis
- Updated package.json with new dependencies for job processing
- Updated tsconfig with worker-specific configuration
- Refactored date utilities to be more consistent
- Improved API routes for job management
- Enhanced admin interface with better job visualization
- Refactored all direct email sending to use the queue system
- Updated waitlist email functions to use the new email service

### Security

- Added Stripe webhook signature verification
- Secure handling of payment processing
- Protected routes with authentication checks

## [0.1.0] - 2024-04-01

### Added

- Initial release
