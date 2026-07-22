# Erwin — repository tracker

This document starts with a concise **implementation tracker**. The **complete technical specification** (May 1, 2026, Nicole Bettison) is included below in full.

## Database migration

Apply new Prisma migration when the DB is up:

```bash
npx prisma migrate deploy
```

Migration folder: `prisma/migrations/20260501140000_erwin_foundation/`

## Implementation status (living checklist)

### Done (recent)

- [x] Full May 1, 2026 technical specification archived below (verbatim).
- [x] Stage 1 ranking: deadline pressure (sigmoid), effort fit, normalized grade impact pool, base score weights, urgency tiers, personal filler lane, long-horizon visibility boost, skip-spiral DANGER escalation.
- [x] Canvas sync: pool normalization of `gradeImpactScore` after each sync; adaptive polling interval (30 min when a deadline exists within 48h, else provider default).
- [x] Focus landing: authenticated home (`/` when homepage disabled) redirects to `/focus`.
- [x] Availability: `slotNarrative` line for Focus briefing header.
- [x] Focus UI: quick-add manual task dialog (title-only).

### Still outstanding (spec)

- [ ] Stage 2 learned ranker (`RankerState`, pairwise SGD, α schedule).
- [ ] Daily briefing "once per day" dismissible flow (§7.2).
- [ ] Calendar tab: Erwin-suggested task blocks overlay (read-only).
- [ ] Progress dashboard depth (§7.4 / Phase 6): trends, per-course, productive hour, GitHub.
- [ ] GitHub passive sync (§2.3).
- [ ] Phase 0: remove Google/Outlook calendar stacks when CalDAV-only is verified.
- [ ] Optional: subtask decomposition prompt for long-horizon projects (§5.2.7).

---

## Direction (July 2026): v2 — The Secretary

§1 already says it: Erwin is a secretary. v1 built the engine but only gave it one client (Canvas) and one mouth (a localhost web page). Result: when the semester ended, Erwin went silent, and the stale-task noise from past courses (411 junk tasks) made it not worth opening. Both are fixed or fixable; v2 makes Erwin useful year-round and proactive.

### Why v1 stalled (honest postmortem)

1. **Stale Canvas noise** — sync pulled every course ever enrolled. Fixed in Batch 2 (active-enrollment filter + purge), landing with this commit. Needs verification against live Canvas.
2. **Pull-only** — Erwin only exists if you open it. A secretary comes to you.
3. **School-only brain** — every ranking signal is Canvas-derived. Summer = nothing to say.

### v2 Pillars

**1. Goal cycles (two-month blocks).** Mirrors how Kaito already plans: the year runs in two-month increments, each with its own goals, broken down into smaller time-boxed pieces.

- `GoalCycle` — start/end dates (two months), a short theme. One active at a time.
- `Goal` — belongs to a cycle. Title, why-it-matters, definition of done.
- Tasks link to a goal via optional `goalId`. Goal-linked tasks get an importance signal parallel to `gradeImpactScore`, so personal goals compete with coursework in the main ranking pool instead of rotting in the filler lane.
- Briefing gains a cycle header: days left in the cycle, per-goal movement this week.

**2. Push delivery (Discord).** Morning briefing delivered to Discord via webhook, driven by a BullMQ repeatable job. Same briefing data the web app renders — the web app becomes the office, Discord is the mouth. Zero-input principle holds: nothing to open, nothing to remember.

**3. Year-round sources.** Canvas is seasonal; goals + manual tasks (+ GitHub later, per §2.3) keep the queue alive between semesters.

### Phasing

- **v2.0** — land v1 WIP (this commit); verify Canvas purge against live Canvas.
- **v2.1** — Discord webhook briefing push (morning cron). Smallest slice that makes Erwin exist in daily life again.
- **v2.2** — `GoalCycle`/`Goal` models + quick goal capture; cycle header in briefing.
- **v2.3** — goal-task ranking integration; end-of-cycle review flow.
- **Fall prep (before ~Sept 2026)** — four courses incoming: re-verify Canvas sync, grade-impact pool, and adaptive polling with the new semester's data.

---

# Erwin — Technical Specification & Architecture Document

> **Project:** Erwin (forked from FluidCalendar, MIT licensed)
> **Author:** Nicole Bettison
> **Date:** May 1, 2026
> **Status:** Pre-implementation spec — brainstorm finalized
> **Stack:** Next.js, Tailwind, Prisma, PostgreSQL, Docker, BullMQ

---

## 1. What Erwin Is

Erwin is a personal task intelligence system that answers one question: **"What should I do right now?"**

Named after Commander Erwin Smith (Attack on Titan) — the leader who decides the mission so the soldiers don't have to think, just move. Erwin reads your assignments, reads your calendar, and tells you what to work on. You execute.

Erwin is **not** a calendar app. It's **not** a to-do list. It's **not** a Notion replacement. It's a secretary that looks at your schedule, looks at your obligations, and gives you orders.

### Core Philosophy

- **Zero manual input where possible.** If a system already knows the information, Erwin reads it. You don't re-enter it.
- **One task at a time.** No staring at 40 tasks wondering what matters. Erwin picks one. You do it or skip it.
- **Real progress, not fake gamification.** No XP bars. No streaks that guilt you. Just honest data: here's what you did.
- **Read-only from external sources.** Erwin never writes back to Canvas, your calendars, or any external system. It only reads.

---

## 2. Data Sources

Erwin has three external data sources and one internal source. All external sources are read-only.

### 2.1 Canvas LMS API (Primary Task Feed)

**What it provides:** Assignments, due dates, submission status, course info, assignment group weights, grading types, point values.

**Authentication:** Canvas personal access token (not OAuth — simpler, no token refresh headaches).

**Sync cadence:** Adaptive polling.
- Default: every 2 hours
- When assignments are due within 48 hours: every 30 minutes
- Rationale: new assignments get posted days/weeks ahead. But submission status matters more as deadlines approach.

**Key endpoints:**

| Endpoint | Data Retrieved | Use in Erwin |
|---|---|---|
| `GET /api/v1/courses` | Active courses, course names, enrollment status | Category tagging, course context |
| `GET /api/v1/courses/:id/assignments` | Assignment objects with full metadata | Primary task creation |
| `GET /api/v1/courses/:id/assignment_groups` | Group names, group weights, rules | Grade impact scoring |
| `GET /api/v1/courses/:id/assignments/:id/submissions/self` | Submission status, score, submitted_at, late flag | Task completion detection |
| `GET /api/v1/users/self/upcoming_events` | Upcoming events across all courses | Supplementary deadline feed |

**Fields extracted per assignment:**

| Canvas Field | Erwin Use | Notes |
|---|---|---|
| `name` | Task title | Direct mapping |
| `description` | Task description | HTML, stored but not displayed by default |
| `due_at` | Primary deadline | ISO datetime |
| `lock_at` | Hard cutoff (can't submit after) | True deadline for urgency calc |
| `unlock_at` | Availability start | Task hidden until this date |
| `points_possible` | Grade impact input | Combined with group_weight |
| `submission_types[]` | Effort estimation heuristic | Maps to duration estimates |
| `grading_type` | Importance classification | pass_fail, points, letter_grade, not_graded |
| `assignment_group_id` | Links to group weight | Foreign key to assignment group |
| `course_id` | Course context / categorization | Foreign key to course |
| `has_submitted_submissions` | Completion detection | Boolean |
| `omit_from_final_grade` | Importance modifier | Deprioritize if true |

**Fields from assignment groups:**

| Canvas Field | Erwin Use |
|---|---|
| `name` | Category label ("Homework", "Exams", "Projects") |
| `group_weight` | The percentage this category contributes to final grade |
| `rules.drop_lowest` | Adjusts importance of individual assignments in this group |

**Fields from submissions:**

| Canvas Field | Erwin Use |
|---|---|
| `workflow_state` | "submitted" / "unsubmitted" / "graded" — completion detection |
| `submitted_at` | When submitted — used for historical completion time patterns |
| `score` | Grade received — potential future feature for performance tracking |
| `late` | Whether submission was past due_at |

### 2.2 Apple Calendar via CalDAV (Schedule Feed)

**What it provides:** Calendar events from all linked accounts (Apple personal, Google work, Outlook school — all aggregated into Apple Calendar).

**Authentication:** iCloud app-specific password + CalDAV protocol against `caldav.icloud.com`.

**Sync cadence:** Every 10–15 minutes via polling. CalDAV uses CTags (collection entity tags) to detect changes efficiently — if the CTag hasn't changed, no events changed, skip the full sync.

**Data extracted per event (iCalendar standard):**

| iCal Field | Erwin Use |
|---|---|
| `SUMMARY` | Event title |
| `DTSTART` / `DTEND` | Busy time block |
| `RRULE` | Recurring event expansion |
| `LOCATION` | Context (optional display) |
| `TRANSP` (transparency) | OPAQUE = busy, TRANSPARENT = free |
| `STATUS` | CONFIRMED / TENTATIVE / CANCELLED |

**What CalDAV does NOT provide (vs native Google/Outlook APIs):**

| Lost Field | Impact | Mitigation |
|---|---|---|
| Google Meet / Teams join links | Can't surface "click to join" | Not Erwin's job — use Apple Calendar for that |
| Attendee RSVP status | Can't detect "meeting might not happen" | Treat all confirmed events as busy (safe default) |
| Real-time push notifications | Must poll instead of instant updates | 10-15 min polling is fine for schedule changes |
| Outlook `importance` field | Lose sender-set priority on meetings | Marginal value — most people don't set this |
| Outlook `categories` | Lose color category metadata | Apple Calendar preserves color by source account |

**Decision rationale:** One CalDAV connection replaces three separate OAuth integrations (Google, Outlook, Apple). Eliminates ~60% of auth/token/sync bugs in the current FluidCalendar codebase. The lost metadata is not used by Erwin's scheduling engine — it only needs event times to compute availability.

**Data storage:** Rolling 14-day window. Events older than 7 days in the past get purged. Events up to 7 days in the future are stored. Erwin only cares about upcoming availability.

### 2.3 GitHub API (Passive Momentum Tracking)

**What it provides:** Commit activity, PR status.

**Authentication:** Personal access token.

**Sync cadence:** Every 6 hours. This is not time-sensitive.

**Use:** Feeds the momentum/progress dashboard. "You pushed 8 commits to Mahoraga this week." Not used for scheduling decisions. Lowest priority to implement.

### 2.4 Local Provider (Manual Tasks)

**What it provides:** Tasks you create directly in Erwin.

**Input model:** Type a title, hit enter. That's it. Everything else gets smart defaults:

| Field | Default Value | Override Available? |
|---|---|---|
| Priority | Medium | Yes (one-tap toggle) |
| Estimated duration | 30 minutes | Yes (quick select: 15m / 30m / 1h / 2h / 3h) |
| Due date | None | Yes (date picker) |
| Category | Personal | Yes (dropdown: School / Work / Personal / Project) |
| Energy level | Medium | No (inferred from time-of-day by ranker) |

---

## 3. Architecture

### 3.1 Layer Diagram

```
┌────────────────────────────────────────────────────┐
│                    UI LAYER                         │
│  Focus Mode │ Calendar View │ Progress │ Tasks List │
└──────────────────────┬─────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────┐
│               RANKING ENGINE                        │
│  Stage 1: Hard Constraints (deterministic)          │
│  Stage 2: Learned Ranker (adaptive)                 │
└──────────────────────┬─────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────┐
│            AVAILABILITY ENGINE                      │
│  CalDAV events → busy/free timeline → open slots    │
└──────────────────────┬─────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────┐
│              UNIFIED TASK STORE                      │
│  Normalized tasks from all sources + ranking fields │
└──────────────────────┬─────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────┐
│            PROVIDER INFRASTRUCTURE                   │
│  CanvasProvider │ CalDAVProvider │ LocalProvider      │
│  (BullMQ background jobs for sync)                  │
└──────────────────────┬─────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────┐
│              EXTERNAL DATA SOURCES                   │
│  Canvas LMS API │ iCloud CalDAV │ GitHub API         │
└────────────────────────────────────────────────────┘
```

### 3.2 Provider Infrastructure

We inherit FluidCalendar's provider pattern but simplify it for read-only, one-way sync.

```typescript
// Simplified provider interface — read-only, no write-back
interface ErwinProviderInterface {
  getType(): string;
  getName(): string;
  validateConnection(): Promise<boolean>;
  sync(): Promise<SyncResult>;
  getLastSyncTime(): Date | null;
}

// Canvas extends with rich academic data
interface CanvasProviderInterface extends ErwinProviderInterface {
  getCourses(): Promise<Course[]>;
  getAssignments(courseId: string): Promise<CanvasAssignment[]>;
  getAssignmentGroups(courseId: string): Promise<AssignmentGroup[]>;
  getSubmissionStatus(courseId: string, assignmentId: string): Promise<Submission>;
}

// CalDAV reads calendar events, not tasks
interface CalDAVProviderInterface extends ErwinProviderInterface {
  getEvents(from: Date, to: Date): Promise<CalendarEvent[]>;
  getCalendars(): Promise<Calendar[]>;
}

// Local is just CRUD on internal tasks
interface LocalProviderInterface extends ErwinProviderInterface {
  createTask(title: string, options?: Partial<TaskInput>): Promise<Task>;
  updateTask(id: string, updates: Partial<TaskInput>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}
```

**What we're removing from FluidCalendar's provider infrastructure:**

- Two-way sync (`syncDirection` field, change propagation, conflict resolution)
- TaskChangeTracker (no local changes need to propagate externally)
- ConflictResolution system (no conflicts possible with read-only sync)
- Google Calendar OAuth routes and sync logic
- Outlook Calendar OAuth routes and sync logic
- Planned Asana / Todoist / Jira providers
- Task list mapping complexity (1-to-1 vs many-to-one debates)

**What we're keeping:**

- `TaskProvider` model pattern (modified for our three providers)
- BullMQ background job infrastructure (for periodic sync polling)
- CalDAV auth route (building on it for Apple Calendar)
- Basic task CRUD operations
- Prisma / PostgreSQL data layer
- Docker setup
- Token manager (simplified for Canvas PAT + iCloud app-specific password)

### 3.3 Sync Architecture

All sync is one-way: external source → Erwin.

```
Canvas API ──poll──▶ CanvasProvider ──upsert──▶ Task Store
                                                    │
iCloud CalDAV ──poll──▶ CalDAVProvider ──upsert──▶ Event Store
                                                    │
GitHub API ──poll──▶ GitHubProvider ──upsert──▶ Activity Store
                                                    │
                                          ┌─────────▼──────────┐
                                          │  Ranking Engine     │
                                          │  recomputes on:     │
                                          │  - new sync data    │
                                          │  - user interaction  │
                                          │  - time change      │
                                          └────────────────────┘
```

**Sync job configuration (BullMQ):**

| Provider | Default Interval | Adaptive Trigger | Retry Strategy |
|---|---|---|---|
| Canvas | 2 hours | 30 min when deadlines within 48h | 3 attempts, exponential backoff |
| CalDAV | 15 minutes | N/A (consistent polling) | 3 attempts, 30s backoff |
| GitHub | 6 hours | N/A | 2 attempts, 60s backoff |

---

## 4. Data Models

### 4.1 Unified Task Model

Every task in Erwin, regardless of source, is stored in this schema.

```prisma
model Task {
  id                  String    @id @default(cuid())
  
  // === Identity ===
  title               String
  description         String?   // HTML for Canvas tasks, plain text for manual
  source              String    // CANVAS | LOCAL
  externalTaskId      String?   // Canvas assignment ID
  providerId          String?
  provider            TaskProvider? @relation(fields: [providerId], references: [id])
  
  // === Scheduling Fundamentals ===
  dueAt               DateTime?
  lockAt              DateTime? // Canvas lock_at — true hard cutoff
  unlockAt            DateTime? // Canvas unlock_at — not available before this
  estimatedDuration   Int       @default(30) // minutes
  isCompleted         Boolean   @default(false)
  completedAt         DateTime?
  
  // === Canvas-Derived Fields (auto-populated) ===
  courseId             String?
  courseName          String?
  assignmentGroupName String?
  pointsPossible      Float?
  groupWeight         Float?    // From assignment group (0-100 percentage)
  submissionTypes     Json?     // String array: ["online_upload", "online_quiz", etc.]
  gradingType         String?   // points, pass_fail, letter_grade, not_graded
  submissionStatus    String?   // submitted, unsubmitted, graded, late
  omitFromFinalGrade  Boolean   @default(false)
  
  // === Computed Ranking Fields ===
  gradeImpactScore    Float     @default(0) // 0-1, computed
  urgencyTier         String    @default("NONE") // DANGER | HIGH | NORMAL | LOW | NONE
  
  // === Learned Ranker Fields ===
  skipCount           Int       @default(0)
  lastSkippedAt       DateTime?
  timesSurfaced       Int       @default(0)
  
  // === Categorization ===
  category            String    @default("PERSONAL") // SCHOOL | WORK | PERSONAL | PROJECT
  tags                Json?     // String array
  
  // === Sync Metadata ===
  lastSyncedAt        DateTime?
  syncStatus          String?   // SYNCED | ERROR
  externalUpdatedAt   DateTime?
  externalUrl         String?   // URL to assignment in Canvas
  
  // === Timestamps ===
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  // === Relations ===
  interactions        TaskInteraction[]
  
  @@index([source])
  @@index([providerId])
  @@index([isCompleted])
  @@index([dueAt])
  @@index([urgencyTier])
  @@unique([externalTaskId, providerId])
}
```

### 4.2 Task Interaction Model (Learning Signal)

Every "Done" or "Skip" action is logged for the pairwise learning-to-rank system.

```prisma
model TaskInteraction {
  id            String    @id @default(cuid())
  taskId        String
  task          Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  action        String    // COMPLETED | SKIPPED | SURFACED
  
  // Context at time of interaction (snapshot for learning)
  contextJson   Json      // { timeOfDay, dayOfWeek, tasksCompletedToday, ... }
  
  // Session grouping (for pairwise preferences)
  sessionId     String    // Groups interactions in the same sitting
  
  createdAt     DateTime  @default(now())
  
  @@index([taskId])
  @@index([sessionId])
  @@index([createdAt])
}
```

### 4.3 Calendar Event Model (Availability)

Temporary storage for CalDAV events — used to compute free/busy time.

```prisma
model CalendarEvent {
  id              String    @id @default(cuid())
  externalEventId String    // iCal UID
  providerId      String
  provider        TaskProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  
  title           String
  startAt         DateTime
  endAt           DateTime
  isAllDay        Boolean   @default(false)
  location        String?
  isRecurring     Boolean   @default(false)
  transparency    String    @default("OPAQUE") // OPAQUE (busy) | TRANSPARENT (free)
  status          String    @default("CONFIRMED") // CONFIRMED | TENTATIVE | CANCELLED
  calendarName    String?   // Which calendar this came from
  
  lastSyncedAt    DateTime
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([externalEventId, providerId])
  @@index([startAt])
  @@index([endAt])
  @@index([providerId])
}
```

### 4.4 Ranker State Model

Stores the learned weight vector and training metadata.

```prisma
model RankerState {
  id              String    @id @default(cuid())
  userId          String    @unique
  
  weightVector    Json      // Float array — the learned weights
  learningRate    Float     @default(0.01)
  totalUpdates    Int       @default(0)
  alpha           Float     @default(0.8) // Blend factor: deterministic vs learned
  
  // Performance tracking
  completionRate  Float?    // Tasks completed / tasks surfaced
  avgSkipsBeforeComplete Float? // How many skips before a task gets done
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

### 4.5 Provider Model (Simplified from FluidCalendar)

```prisma
model TaskProvider {
  id            String    @id @default(cuid())
  type          String    // CANVAS | CALDAV | GITHUB
  name          String    // "Northeastern Canvas", "iCloud Calendar", etc.
  enabled       Boolean   @default(true)
  
  // Auth
  accessToken   String?   // Encrypted — Canvas PAT or iCloud app-specific password
  serverUrl     String?   // Canvas instance URL or CalDAV server URL
  
  // Sync state
  lastSyncedAt  DateTime?
  syncStatus    String?   // OK | SYNCING | ERROR
  errorMessage  String?
  syncInterval  Int       @default(120) // minutes (default 2 hours for Canvas)
  
  // Provider-specific config
  settings      Json?     // { canvasUserId, caldavPrincipal, etc. }
  
  // Relations
  tasks         Task[]
  events        CalendarEvent[]
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  @@index([type])
}
```

---

## 5. Ranking Engine

### 5.1 Overview

Two-stage architecture. Stage 1 applies hard constraints and computes a deterministic base score. Stage 2 applies a learned scoring function that adapts to your behavior. The two scores are blended with a trust parameter α.

```
All tasks
    │
    ▼
┌─────────────────────────────┐
│ STAGE 1: Hard Constraints   │
│ - Filter completed          │
│ - Filter not-yet-available  │
│ - Filter by time fit        │
│ - Assign urgency tiers      │
│ - Compute base score        │
│ - Apply edge case handlers  │
└──────────────┬──────────────┘
               │ Candidate set (filtered + scored)
               ▼
┌─────────────────────────────┐
│ STAGE 2: Learned Ranker     │
│ - Compute context vector    │
│ - Apply learned weights     │
│ - Blend with base score     │
│ - Final ranking             │
└──────────────┬──────────────┘
               │
               ▼
        Ordered task list
        (top task = "do this now")
```

### 5.2 Stage 1: Hard Constraints (Deterministic)

#### 5.2.1 Filters (tasks removed from candidate set)

| Filter | Condition | Rationale |
|---|---|---|
| Completed | `isCompleted == true` OR `submissionStatus IN (submitted, graded)` | Done is done |
| Not yet available | `unlockAt > now` | Can't work on it yet |
| Time doesn't fit | `estimatedDuration > currentAvailableSlot` | Don't suggest a 3-hour project in a 30-min gap |
| Cancelled | Calendar event status = CANCELLED | Ignore cancelled events |

#### 5.2.2 Urgency Tiers

Applied after filtering. Tasks in DANGER tier override the learned ranker — they always surface first.

| Tier | Condition | Behavior |
|---|---|---|
| **DANGER** | `timeRemaining < estimatedDuration × 3` | Forced to top. Alert shown. |
| **HIGH** | Due within 24 hours | Strongly boosted |
| **NORMAL** | Due within 7 days | Standard ranking |
| **LOW** | Due beyond 7 days | Ranked normally but lower base urgency |
| **NONE** | No due date (manual tasks) | Enters "filler" pool |

#### 5.2.3 Grade Impact Score

The primary importance signal for Canvas tasks. Computed automatically from Canvas data.

```
gradeImpactScore = (pointsPossible / maxPointsInGroup) × (groupWeight / 100)
```

**Normalization:** Score is normalized to 0–1 range across all active tasks so the highest-impact task in your current pool scores 1.0.

**Edge case handlers:**

| Scenario | Handler |
|---|---|
| `pointsPossible == 0` but task exists with due date | Floor score of 0.15 (completion-required minimum) |
| `groupWeight` is null/0 for all groups in a course | Fallback: `pointsPossible / totalPointsInCourse` |
| `omitFromFinalGrade == true` | Score multiplied by 0.3 (still visible, but deprioritized) |
| `gradingType == "not_graded"` | Floor score of 0.10 |
| `drop_lowest` rule in assignment group | If task count in group > drop count, lowest-point tasks in that group get score × 0.5 |

#### 5.2.4 Deadline Pressure

Exponential urgency curve — pressure stays low when deadlines are far away, then spikes dramatically in the last 2-3 days.

```
deadlinePressure = 1 / (1 + e^(k × (hoursUntilDue - midpoint)))
```

Where:
- `k = 0.15` (steepness of the sigmoid — tunable)
- `midpoint = 48` (hours — pressure crosses 0.5 at 2 days before deadline)
- Output: 0–1, where 1 = due right now

**For tasks past `dueAt` but before `lockAt`** (late but salvageable):
- Deadline pressure stays at 1.0 (maximum urgency)
- UI shows "LATE — submit by [lockAt] for partial credit"
- Grade impact score is discounted by a configurable late penalty (default: -10%/day past due)

**For tasks with no due date** (manual tasks):
- Deadline pressure = 0
- These compete on other dimensions only (category, skip count, age)

#### 5.2.5 Effort Fit Score

How well the task's estimated duration fits the current available time slot.

```
effortFit = 1 - |estimatedDuration - availableSlotDuration| / max(estimatedDuration, availableSlotDuration)
```

A 30-minute task in a 45-minute window scores high (good fit). A 30-minute task in a 4-hour window scores lower (you're wasting a big block on a small task — save it for something bigger).

#### 5.2.6 Base Score Computation

```
baseScore = (gradeImpactScore × w_impact) + (deadlinePressure × w_deadline) + (effortFit × w_effort)
```

**Default weights (hand-tuned, starting values):**

| Weight | Value | Rationale |
|---|---|---|
| `w_impact` | 0.35 | Importance is the primary long-term signal |
| `w_deadline` | 0.45 | Urgency is the primary short-term signal |
| `w_effort` | 0.20 | Fit matters but shouldn't dominate |

These weights are global defaults. The learned ranker in Stage 2 handles the personalization.

#### 5.2.7 Special Handling: Long-Horizon High-Impact Tasks

Problem: A 300-point final project due in 3 weeks has low deadline pressure but massive grade impact. Standard base score keeps it in the middle. But you should be working on it now.

Solution: If `pointsPossible > 80th percentile for the course` AND `dueAt > 7 days away`, apply a **visibility boost** of +0.15 to the base score. This ensures the task appears in your daily briefing as a background item even when short-term tasks dominate.

Additionally, Erwin prompts once: "Final Project is worth 300 points and due in 3 weeks. Want to break this into chunks?" If yes, auto-generates subtasks with staggered deadlines. If no, the visibility boost continues.

#### 5.2.8 Special Handling: Personal Tasks (No Grade Impact)

Personal/manual tasks have no `gradeImpactScore` and often no `dueAt`. They can't compete with Canvas assignments on those dimensions.

Solution: Personal tasks live in a **parallel filler lane**. When no Canvas task is in DANGER or HIGH urgency, personal tasks enter the main ranking pool. They're sorted by:
1. Has a due date → ranked by deadline pressure (same as Canvas tasks)
2. No due date → ranked by age (oldest first, to prevent task rot)
3. User-flagged as "high priority" → jumps into main pool regardless

A manually set high-priority flag is a strong override signal — it tells Erwin "this matters more than my homework right now."

### 5.3 Stage 2: Learned Ranker (Adaptive)

#### 5.3.1 Feature Vector

For each candidate task, compute a context vector capturing both task properties and current state.

| Feature | Encoding | Dimensions | Source |
|---|---|---|---|
| Time of day | sin/cos cyclic | 2 | System clock |
| Day of week | sin/cos cyclic | 2 | System clock |
| Tasks completed today | Normalized (0-1) | 1 | Interaction log |
| Current streak (consecutive active days) | Normalized (0-1) | 1 | Interaction log |
| Hours since last completion | Normalized (0-1) | 1 | Interaction log |
| Estimated duration | Normalized (0-1) | 1 | Task field |
| Energy proxy | Categorical encoded | 1 | Derived from submissionType |
| Deadline proximity bucket | Categorical (5 levels) | 1 | Computed |
| Skip count for this task | Normalized (0-1) | 1 | Task field |
| Task age (days since creation) | Normalized (0-1) | 1 | Task field |
| Source | One-hot (CANVAS, LOCAL) | 2 | Task field |
| Course load balance | Normalized (0-1) | 1 | Computed across courses |

**Total: ~15 dimensions**

**Energy proxy mapping** (from `submissionTypes`):

| Submission Type | Energy Level | Rationale |
|---|---|---|
| `online_quiz` | Low | Fixed duration, structured |
| `discussion_topic` | Low | Short, formulaic |
| `online_text_entry` | Medium | Writing but usually short |
| `online_upload` (essay/report) | High | Extended writing/thinking |
| `online_upload` (code) | High | Deep focus required |
| `external_tool` | Medium | Depends, default to medium |
| `on_paper` | Medium | Physical task |
| Manual task (no type) | Medium | Default |

**Course load balance:** For a given course, `pendingTasksInCourse / totalPendingTasks`. If you have 8 pending tasks and 5 are from CS3500, that course's load balance is 0.625. High values suggest you're falling behind in that course, boosting its tasks.

#### 5.3.2 Scoring Function

Linear scoring:

```
learnedScore = w · x
```

Where `w` is the learned weight vector (15 dims) and `x` is the feature vector. The `learnedScore` is then normalized to 0–1 via sigmoid.

#### 5.3.3 Score Blending

```
finalScore = α × baseScore + (1 - α) × learnedScore
```

**Alpha schedule:**
- Start: α = 0.85 (trust deterministic system heavily, learner is cold)
- After 50 interactions: α = 0.75
- After 200 interactions: α = 0.65
- Floor: α = 0.55 (deterministic system always has significant weight — deadlines are deadlines)

Alpha never goes below 0.55 because the base score encodes hard truths (deadline proximity, grade impact) that should always matter regardless of behavioral patterns.

#### 5.3.4 Learning Signal: Pairwise Preferences

The ranker learns from implicit feedback, not explicit ratings.

**Signal extraction from interactions:**

| Scenario | Pairwise Signal | Interpretation |
|---|---|---|
| Complete task A, having skipped task B in same session | A > B in current context | You preferred A over B right now |
| Complete task A without skipping anything | A > all unsurfaced tasks | A was correctly ranked high |
| Skip task A, then complete task B | B > A in current context | B was the better choice |
| Skip task A, then close app | Weak negative for A | Maybe bad timing, not strong signal |
| Task expires uncompleted | Strong negative | Ranker should have surfaced this earlier |

**Update rule:** Online SGD on pairwise hinge loss.

```
For each pair (winner, loser) in session:
  score_w = w · x_winner
  score_l = w · x_loser
  margin = score_w - score_l
  if margin < 1:  // hinge loss — update if margin is insufficient
    w += learningRate × (x_winner - x_loser)
```

**Learning rate schedule:**
- Start: 0.01
- Decays by 0.999 after each update
- Floor: 0.001

#### 5.3.5 Cold Start

Weight vector initialized with sensible priors (not zeros):

| Feature | Initial Weight | Rationale |
|---|---|---|
| Time of day (sin) | 0.0 | No prior — learns morning vs evening preference |
| Time of day (cos) | 0.0 | No prior |
| Day of week (sin) | 0.0 | No prior |
| Day of week (cos) | 0.0 | No prior |
| Tasks completed today | +0.1 | Slight momentum — if you've done stuff, keep going |
| Current streak | +0.05 | Mild positive |
| Hours since last completion | -0.05 | Slight urgency if it's been a while |
| Estimated duration | -0.1 | Slight preference for shorter tasks (easier to start) |
| Energy proxy | +0.1 | Match energy to time of day |
| Deadline proximity | +0.3 | Strong prior — closer deadlines should rank higher |
| Skip count | -0.15 | Skipped tasks should sink (but see skip spiral handler) |
| Task age | +0.1 | Older tasks get mild boost to prevent rot |
| Source: CANVAS | +0.1 | Slight preference for academic tasks |
| Source: LOCAL | 0.0 | Neutral |
| Course load balance | +0.15 | Boost courses you're falling behind in |

These priors mean the system works sensibly from day one. A student opening Erwin for the first time sees their nearest deadline, highest-impact Canvas assignment, filtered by what fits their current time block. The learned ranker just refines from there.

#### 5.3.6 Skip Spiral Handler

Problem: If a student keeps skipping a task, the learned ranker drops it lower and lower. But if it's a 200-point final project, burying it is catastrophic.

Solution: Skip count has a **non-linear transformation** before entering the feature vector, and a **hard override** for high-impact tasks.

```
Skips 0-2:   transformed_skip = 0       (no signal — normal behavior)
Skips 3-4:   transformed_skip = +0.2    (BOOST — gentle nudge, surface more)
Skips 5+:    transformed_skip = +0.4    (STRONG BOOST — something is wrong)
```

Additionally, if `skipCount >= 3` AND `gradeImpactScore > 0.5` AND `dueAt` is within 5 days:
- Task gets escalated to DANGER tier in Stage 1, overriding the learned ranker
- UI shows: "You've skipped [task] 4 times. It's worth X% of your grade and due in Y days."

The escalation is intentionally aggressive for high-stakes tasks. For low-stakes tasks (discussion posts, 0-point assignments), the boost is smaller and there's no DANGER override.

#### 5.3.7 Pattern Detection for Recurring Tasks

After 3+ completed instances of similar Canvas assignments (same `assignmentGroupName`, similar `pointsPossible`), Erwin updates the `estimatedDuration` for future instances.

```
newEstimate = median(historicalCompletionTimes)
```

Where `historicalCompletionTime` = time between first surfacing and completion, minus known busy time in that interval (estimated from calendar events).

This feeds back into both stages:
- Stage 1: more accurate effort fit scoring
- Stage 2: better duration feature for the learned ranker

---

## 6. Availability Engine

### 6.1 Purpose

Transforms CalDAV events into a free/busy timeline that the ranking engine uses for time-fit filtering and slot-aware scheduling.

### 6.2 Computation

```
Input:  CalendarEvent[] (from CalDAV sync)
        workHours: { start: "09:00", end: "23:00" } (user-configured once)
        
Output: AvailableSlot[] for the next 7 days
        Each slot: { start: DateTime, end: DateTime, durationMinutes: number }
```

**Algorithm:**

1. Start with work hours as fully available for each day
2. Subtract all OPAQUE (busy) calendar events
3. Subtract all TENTATIVE events (conservative — treat as busy)
4. Ignore TRANSPARENT events and CANCELLED events
5. Split remaining time into contiguous available slots
6. Filter out slots shorter than 15 minutes (not useful)

### 6.3 Current Slot Detection

The most important slot is "right now." When you open Focus Mode, Erwin computes:

```
currentSlot = the available slot that contains now()
             OR the next available slot if now() is in a busy block
```

This determines the maximum task duration that can be suggested. If `currentSlot.durationMinutes = 45`, tasks estimated at 60+ minutes won't surface.

### 6.4 Edge Cases

| Scenario | Handling |
|---|---|
| No work hours configured | Default: 8:00 AM – 11:00 PM |
| All-day events | Treated as busy for the full day. User can mark specific all-day events as "not busy" in settings. |
| Overlapping events | Union of busy time (overlaps don't double-count) |
| Events outside work hours | Ignored (you weren't available then anyway) |
| No calendar connected | All work hours are available (Erwin works without CalDAV, just less precisely) |

---

## 7. User Interface

### 7.1 Navigation Structure

Four tabs, reordered from FluidCalendar:

```
[1. Focus] [2. Calendar] [3. Progress] [4. Tasks]
```

| Tab | Purpose | Primary/Secondary |
|---|---|---|
| **Focus** | Daily briefing + one-task-at-a-time mode | Primary (landing page) |
| **Calendar** | Read-only week/day view with events + scheduled task blocks | Reference |
| **Progress** | Momentum dashboard, completion stats, streaks | Motivation |
| **Tasks** | Traditional task list view (all tasks, filterable) | Fallback / overview |

### 7.2 Focus Mode (Tab 1)

The star of the show. This is what you see when you open Erwin.

**Daily Briefing (shown on first open of the day):**
- Today's date and day
- Calendar summary: X events today, next event at [time]
- Deadline summary: X tasks due today, Y due this week
- Danger zone alerts (if any tasks in DANGER tier)
- "Here's your plan" — Erwin's recommended task order for the day
- Tap to enter Focus Mode

**Focus Mode (active state):**
- **One task, centered, prominent.** Title, course/category tag, due date, estimated time.
- **Two buttons:** Done ✓ | Skip →
- **"Up next" preview:** subtle display of tasks #2 and #3 in the ranking, so you have context but aren't overwhelmed
- **Current slot info:** "You have 2h 15m before [next event]"
- **Quick-add button:** floating "+" to create a manual task (title only, enter to submit)

**Interaction flow:**
1. Open Erwin → Daily Briefing (once per day, then goes straight to Focus)
2. See top task → Do it → tap Done → next task surfaces → repeat
3. Not feeling it → tap Skip → task moves down, next surfaces
4. Every interaction is logged to `TaskInteraction` table for learning

### 7.3 Calendar View (Tab 2)

Kept from FluidCalendar. Read-only display of:
- CalDAV events (your actual schedule — classes, meetings, etc.)
- Erwin's suggested task blocks overlaid in a distinct color
- Day / Week / Month views (Week as default)

You can see where Erwin placed tasks in your free time. You do NOT manually drag tasks around — Erwin places them based on the ranking. If you disagree, you skip the task in Focus Mode, which teaches the ranker.

### 7.4 Progress Dashboard (Tab 3)

Honest data, no fake gamification.

- Tasks completed today / this week / this month
- Completion rate (tasks done vs tasks surfaced)
- Active day streak (days where at least one task was completed)
- Weekly trend graph (tasks completed per day, 4-week view)
- Per-course breakdown (how many tasks done per class)
- GitHub commit activity (if connected)
- Average tasks per day
- Most productive time of day (from interaction timestamps)

### 7.5 Tasks View (Tab 4)

Traditional list view. All tasks, sortable/filterable.

- Filter by: source (Canvas / Manual), category (School / Work / Personal), status (pending / completed / overdue)
- Sort by: due date, grade impact, recently added
- Bulk actions: mark complete, delete (manual tasks only)
- This is the "debug view" — when you want to see everything Erwin is working with

---

## 8. Edge Cases — Complete Reference

### 8.1 Canvas Data Edge Cases

| # | Scenario | Detection | Resolution |
|---|---|---|---|
| 1 | Ungraded mandatory assignment (0 points, has due date) | `pointsPossible == 0 AND dueAt != null` | Floor importance score of 0.15 |
| 2 | Missing group weights (professor didn't configure) | All `groupWeight == null OR 0` for a course | Fallback: `pointsPossible / totalCoursePoints` |
| 3 | Urgent low-value vs important high-value conflict | 5-point post due tomorrow vs 200-point project due next week | Stage 1 danger zone catches the urgent task; project gets visibility boost |
| 4 | Late submissions with penalty window | `now > dueAt AND now < lockAt` | Pressure stays at 1.0, grade impact discounted by late penalty rate |
| 5 | Multi-week project with single deadline | `pointsPossible > 80th percentile AND dueAt > 7 days` | Persistent visibility boost + optional subtask decomposition prompt |
| 6 | Assignment already submitted | `submissionStatus IN (submitted, graded)` | Filtered out of candidate set entirely |
| 7 | Assignment not yet available | `unlockAt > now` | Filtered out until unlock date |
| 8 | Drop-lowest rule in assignment group | `rules.drop_lowest > 0` and task is lowest-point in group | Score × 0.5 if task count > drop count |
| 9 | Canvas API token expires | Auth error on sync | Show error in UI, prompt to update token. Tasks remain with stale data. |
| 10 | Course ends / becomes unavailable | Course enrollment status changes | Archive course tasks, stop syncing |

### 8.2 Calendar Edge Cases

| # | Scenario | Detection | Resolution |
|---|---|---|---|
| 11 | Calendar event that is actually productive time (office hours, study group) | Cannot detect from CalDAV data alone | Default: treat as busy. Future: let user tag recurring events as "flexible" |
| 12 | All-day events (holidays, travel) | `isAllDay == true` | Treat as busy for full day. Show in daily briefing as context. |
| 13 | Overlapping events | Multiple events with overlapping time ranges | Union of busy time — no double counting |
| 14 | iCloud CalDAV authentication failure | Connection error on sync | Retry 3x with backoff. Show error. Erwin still works — just treats all work hours as available. |
| 15 | Event rescheduled between polls | CTag change detected on next poll | Update stored event. If task was placed in the now-busy slot, re-rank. |

### 8.3 Ranking Edge Cases

| # | Scenario | Detection | Resolution |
|---|---|---|---|
| 16 | Nothing due for several days | All tasks have `urgencyTier IN (LOW, NONE)` | Surface highest grade-impact task. If all equal, prefer oldest task. |
| 17 | Personal tasks can't compete with Canvas tasks | Manual tasks have no `gradeImpactScore` | Parallel filler lane — personal tasks surface when no Canvas task is urgent |
| 18 | Skip spiral (keep skipping a task) | `skipCount >= 3` | Non-linear skip boost. If high-impact + approaching deadline → DANGER escalation |
| 19 | Recurring assignments (weekly discussion posts) | 3+ completed tasks from same assignment group with regular interval | Auto-update `estimatedDuration` using median of historical completion times |
| 20 | Cold start (no interaction history) | `RankerState.totalUpdates == 0` | Sensible weight priors (see §5.3.5). System works from day one. |
| 21 | Too many tasks (>50 pending) | Count of non-completed tasks | Ranker handles it — Stage 1 filters aggressively, Focus Mode still shows one task |
| 22 | Zero tasks (nothing to do) | Empty candidate set after filtering | Focus Mode shows "All clear! Nothing pending." with momentum stats. |

### 8.4 System Edge Cases

| # | Scenario | Detection | Resolution |
|---|---|---|---|
| 23 | No internet / APIs unreachable | Sync job failures | Work with cached data. Show "last synced X ago" indicator. |
| 24 | Database migration from FluidCalendar schema | Schema diff on startup | Prisma migrations handle this. One-time migration script for existing data. |
| 25 | Docker container restart | Container lifecycle | BullMQ jobs persist in Redis. Sync resumes on restart. |
| 26 | Multiple browser tabs open | Concurrent access | Task interactions should be idempotent. Session IDs prevent duplicate logging. |

---

## 9. What We're Removing from FluidCalendar

### 9.1 Code Deletions

| Component | Location (approximate) | Reason |
|---|---|---|
| Google Calendar OAuth | `src/app/api/calendar/google/` | Replaced by CalDAV |
| Outlook Calendar OAuth | `src/app/api/calendar/outlook/` | Replaced by CalDAV |
| Two-way sync infrastructure | `TaskChangeTracker`, conflict resolution, `syncDirection` fields | Erwin is read-only from external sources |
| Asana/Todoist/Jira provider plans | Planned, not yet built | Not needed — Canvas is our task source |
| Sponsorship/promo UI | Already partially cleaned | Continue cleanup |
| Outlook Tasks import | `OutlookTasksService` | Replaced by Canvas as primary task source |

### 9.2 Schema Removals

- `OutlookTaskListMapping` model → replaced by simplified `TaskProvider` + `CalendarEvent`
- `syncDirection` field on mappings → not needed (always one-way)
- Conflict resolution fields (`syncStatus: "CONFLICT"`, resolution UI) → no conflicts possible
- `TaskChange` model (change tracking for write-back) → no write-back

### 9.3 What We're Keeping

| Component | Reason |
|---|---|
| CalDAV auth route structure | Building Apple Calendar integration on top of it |
| BullMQ job infrastructure | Periodic sync polling |
| Prisma + PostgreSQL data layer | Core data store |
| Docker Compose setup | Local development |
| Basic task CRUD API routes | Foundation for local task management |
| Calendar week/day/month UI components | Calendar view tab |
| Focus Mode UI shell | Already exists in FluidCalendar, needs enhancement |

---

## 10. Implementation Phases

### Phase 0: Codebase Cleanup (1 session)
- Fix remaining build errors from previous session
- Remove Google/Outlook calendar OAuth routes and services
- Remove two-way sync infrastructure
- Remove planned provider stubs (Asana, Todoist, Jira)
- Finish sponsorship/promo cleanup
- Rename to Erwin throughout (branding, page titles, README)
- Verify clean build and deploy via Docker

### Phase 1: Canvas Integration (2-3 sessions)
- Implement `CanvasProvider` with all assignment/group/submission endpoints
- Build Canvas API token configuration UI (Settings page)
- Create background sync job (BullMQ) with adaptive polling
- Auto-populate tasks from Canvas assignments with all derived fields
- Compute `gradeImpactScore` from `pointsPossible × groupWeight`
- Map courses to categories automatically
- Handle all Canvas edge cases (§8.1)
- Test with real Northeastern Canvas data

### Phase 2: CalDAV / Apple Calendar Integration (2-3 sessions)
- Implement `CalDAVProvider` using `tsdav` library
- iCloud app-specific password configuration UI
- Background sync job for calendar events (15-min polling with CTag optimization)
- Build Availability Engine (busy/free timeline computation)
- Integrate availability data into Calendar View tab
- Handle calendar edge cases (§8.2)
- Test with real iCloud calendar data

### Phase 3: Ranking Engine — Stage 1 (2-3 sessions)
- Implement all Stage 1 filters and urgency tier assignment
- Implement `gradeImpactScore` computation with all edge case handlers
- Implement deadline pressure sigmoid curve
- Implement effort fit scoring
- Implement base score computation with default weights
- Implement long-horizon visibility boost
- Implement personal task filler lane
- Wire ranking to Focus Mode — top task surfaces correctly
- Test with mix of Canvas tasks + manual tasks + calendar constraints

### Phase 4: Focus Mode & Daily Briefing UI (1-2 sessions)
- Build Daily Briefing view (morning summary)
- Build Focus Mode one-task view (Done / Skip buttons)
- Build "up next" preview
- Build quick-add for manual tasks
- Wire interaction logging (`TaskInteraction` model)
- Reorder tabs: Focus | Calendar | Progress | Tasks
- Style everything with Erwin's identity (not FluidCalendar's)

### Phase 5: Ranking Engine — Stage 2 / Learned Ranker (2-3 sessions)
- Implement feature vector computation
- Implement linear scoring function with initial weight priors
- Implement pairwise preference extraction from interaction logs
- Implement online SGD weight updates
- Implement alpha blending schedule
- Implement skip spiral handler with non-linear transformation
- Implement pattern detection for recurring tasks
- Store `RankerState` in database
- Test learning with simulated interaction sequences

### Phase 6: Progress Dashboard (1 session)
- Build completion stats (daily / weekly / monthly)
- Build streak counter
- Build weekly trend graph
- Build per-course breakdown
- Build most-productive-time-of-day analysis
- Optional: GitHub commit integration

### Phase 7: Polish & Hardening (1-2 sessions)
- Error handling for all sync failures (graceful degradation)
- Loading states and sync status indicators
- Responsive design / mobile-friendly
- README rewrite with Erwin branding and fork attribution
- Portfolio-ready documentation of the ranking algorithm
- Performance optimization (ranking computation should be <100ms)

---

## 11. Portfolio Positioning

Erwin combines several technically impressive elements:

1. **Learning-to-rank from implicit feedback** — pairwise preference learning with online SGD, applied to a real consumer product. Same family of techniques used in search engine ranking and recommendation systems.

2. **Contextual personalization** — 15-dimensional context vectors capturing temporal, behavioral, and academic signals. Adapts to individual work patterns without explicit configuration.

3. **Domain-specific feature engineering** — the `gradeImpactScore` formula using Canvas assignment group weights is a novel application of academic metadata for task prioritization. No existing student productivity tool does this.

4. **Hybrid architecture** — deterministic hard constraints (deadlines, grade impact) blended with learned soft preferences (time-of-day, energy matching). Demonstrates understanding of when to use rules vs. when to use ML.

5. **Cold-start handling** — sensible weight priors inspired by the PILOT approach (Panda et al., EMNLP 2025), ensuring the system works from first interaction. Connects to Mahoraga's warm-start methodology.

6. **Full-stack implementation** — Next.js + Prisma + BullMQ + CalDAV + Canvas API + custom ranking engine. Demonstrates ability to build a complete product, not just an ML prototype.

The write-up for portfolio: "Forked an open-source calendar app and transformed it into a personal task intelligence system. Built a two-stage ranking engine that uses Canvas LMS academic metadata (assignment weights, grade impact) combined with a pairwise learning-to-rank model trained on implicit behavioral signals. The system adapts to individual work patterns while maintaining hard scheduling constraints."

---

## Appendix A: Canvas API Setup

1. Log into Canvas (northeastern.instructure.com or similar)
2. Go to Account → Settings
3. Under "Approved Integrations", click "+ New Access Token"
4. Name it "Erwin", set expiry (or no expiry for personal use)
5. Copy the token — this goes into Erwin's settings page
6. Erwin uses this token for all Canvas API requests

No OAuth flow needed. Personal access tokens are simpler and don't expire unexpectedly (unless you set an expiry).

## Appendix B: iCloud CalDAV Setup

1. Go to appleid.apple.com → Sign-In and Security → App-Specific Passwords
2. Generate a new app-specific password, name it "Erwin"
3. Copy the password — this goes into Erwin's settings page
4. Erwin connects to `caldav.icloud.com` using your Apple ID email + this password
5. Before this: link Google and Outlook accounts to Apple Calendar via System Settings → Internet Accounts

## Appendix C: Glossary

| Term | Definition |
|---|---|
| Grade Impact Score | Computed importance of a Canvas assignment: `(points / maxInGroup) × (groupWeight / 100)` |
| Deadline Pressure | Sigmoid urgency curve based on time remaining until `dueAt` |
| Urgency Tier | Categorical urgency level: DANGER > HIGH > NORMAL > LOW > NONE |
| Effort Fit | How well a task's duration matches the current available time slot |
| Alpha (α) | Blend parameter between deterministic base score and learned score |
| Pairwise Preference | Learning signal: "you chose A over B" inferred from Done/Skip actions |
| Filler Lane | Parallel ranking pool for tasks without due dates or grade impact |
| Skip Spiral | When repeated skipping causes the ranker to bury an important task |
| Visibility Boost | Score bonus for high-impact long-horizon tasks to prevent neglect |
| CTag | CalDAV collection entity tag — changes when any event in the calendar changes |