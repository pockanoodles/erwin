# Erwin V1 Cleanup — Design Spec

**Date:** 2026-05-05  
**Branch:** main  
**Source doc:** docs/v1-cleanup.md

---

## Scope

Six changes in this batch. First three are cosmetic/routing (low risk). Fourth is a real bug fix in the scheduler. Fifth is a config change. Sixth is the theme port from Mahoraga.

---

## 1. Kill the FluidCalendar Landing Page

**Problem:** `/` shows a FluidCalendar marketing page. Authenticated users have to click "Go to App" to reach `/focus`.

**Design:**
- Delete `src/app/(open)/page.open.tsx` entirely (and the `(open)` route group if it becomes empty).
- Simplify `src/middleware.ts`: remove the `getHomepageSetting(request)` async DB lookup on `/`. Replace with a direct auth check — authenticated → redirect `/focus`, unauthenticated → redirect `/auth/signin`. No feature flag, no API call, no interstitial.

**Result:** Root path always bounces immediately. Zero marketing page code left in the repo.

---

## 2. Reorder Navigation + Remove FluidCalendar Chrome

**Problem:** Nav shows Calendar | Tasks | Focus order; has FluidCalendar logo; has Progress tab (not built); has Shortcuts button.

**Design:** Edit `src/components/navigation/AppNav.tsx`:
- Links array: `[Focus, Calendar, Tasks]` — remove Progress entirely.
- Remove the logo `<Link>` + `<Image src="/logo.svg">` block.
- Remove the Shortcuts button from the top-right nav area.
- Keep Search and theme toggle (sun/moon).

**Note:** Focus is already first in the current links array — just need to drop Progress.

---

## 3. Auto-Scheduler: Deadline as Hard Ceiling

**Problem:** Tasks are scheduled past their `dueAt` and outside configured work hours (e.g., "Gym" due May 5 gets placed May 6 at 6 AM).

**Root cause:** `TimeSlotManager.findAvailableSlots` accepts an `endDate` param but the caller (`TaskSchedulingService`) passes a far-future date instead of `task.dueAt`. Work hour filtering exists but slot generation can emit slots outside hours if the initial `localCurrentStart` is already past `workHourEnd`.

**Design — three fixes:**

### 3a. Pass `dueAt` (or `lockAt`) as `endDate`
In `TaskSchedulingService.ts`, when calling `findAvailableSlots`, compute:
```
hardDeadline = task.lockAt ?? task.dueAt ?? farFuture
endDate = hardDeadline   // slot search window never exceeds this
```

### 3b. Slot generation respects work hours on first slot
In `TimeSlotManager.generatePotentialSlots`, ensure the initial `localCurrentStart` is snapped forward to `workHourStart` if it falls before work hours (early morning). The existing "push to next day" check handles the past-end case but doesn't handle the before-start case.

### 3c. Unschedulable detection
In `TaskSchedulingService.scheduleTask`, if `findAvailableSlots` returns an empty array AND `task.dueAt` is set, do not schedule at all. Instead:
- Set `task.schedulingStatus = "UNSCHEDULABLE"` (or surface via existing error field).
- Log a warning — do not silently assign a future slot.

### 3d. Today-first for urgent tasks
For tasks due today (or overdue), `startDate` passed to `findAvailableSlots` should be `now` (not start-of-today), so remaining slots today are considered first.

---

## 4. Default Working Hours → 08:00–23:00

**Problem:** `DEFAULT_AUTO_SCHEDULE_CREATE` in `TaskSchedulingService.ts` sets `workHourStart: 9, workHourEnd: 17`. Wrong for a college student.

**Design:** Change to `workHourStart: 8, workHourEnd: 23`. Only affects new user creation — existing settings rows are untouched (the create-if-missing block in `TaskSchedulingService.ts` only fires when no row exists for the user).

---

## 5. Branding: FluidCalendar → Erwin

**Scope:** UI-visible strings only. Do not rename files, components, or internal identifiers.

**Files to update:**
| File | Change |
|------|--------|
| `src/app/metadata.ts` | title: "Erwin", description: "Your personal task intelligence system" |
| `src/app/(common)/auth/signin/page.tsx` | "Sign in to FluidCalendar" → "Sign in to Erwin" |
| `src/app/(common)/setup/page.tsx` | "FluidCalendar Setup" / "Welcome to FluidCalendar" → Erwin equivalents |
| `src/components/auth/SignInForm.tsx` | Any FluidCalendar welcome text |
| `src/components/focus/ErwinFocusMode.tsx` | Already Erwin-branded, verify |

**Skip:** `caldav-calendar.ts` prodid (`-//FluidCalendar//EN`), email templates (low priority, not user-visible in app), any comment strings or variable names.

---

## 6. Theme: Port Mahoraga Palette

**Problem:** Erwin uses a bland pure-white / pure-black theme with no visual identity. Mahoraga has been validated as visually clear and well-contrasted.

**Design:** Replace CSS variable values in `src/app/globals.css` `:root` and `.dark` blocks with Mahoraga's palette. Keep the same variable names (they match — Erwin already uses the shadcn/ui standard set). No changes to `tailwind.config.ts` needed since it already maps `hsl(var(--background))` etc.

**Light theme target (`:root`):**
```css
--background: 45 49% 97%;       /* warm cream #F8F5F0 */
--foreground: 222.2 84% 4.9%;   /* deep navy #0C0E23 */
--card: 44 60% 99%;
--card-foreground: 222.2 84% 4.9%;
--popover: 44 60% 99%;
--popover-foreground: 222.2 84% 4.9%;
--primary: 222.2 47.4% 11.2%;   /* dark navy #0F1C47 */
--primary-foreground: 45 30% 97%;
--secondary: 40 33% 93%;        /* warm tan #EDE8E0 */
--secondary-foreground: 222.2 47.4% 11.2%;
--muted: 40 33% 93%;
--muted-foreground: 215 13% 34%; /* slate #536480 */
--accent: 40 33% 93%;
--accent-foreground: 222.2 47.4% 11.2%;
--destructive: 0 84.2% 60.2%;
--destructive-foreground: 45 30% 97%;
--border: 36 25% 88%;            /* warm taupe #DFD7CE */
--input: 36 25% 88%;
--ring: 222.2 84% 4.9%;
--chart-1: 178 75% 44%;          /* teal #1DB884 */
--chart-2: 197 37% 24%;
--chart-3: 167 70% 48%;
--chart-4: 349 52% 61%;
--chart-5: 43 96% 56%;
```

**Dark theme target (`.dark`):**
```css
--background: 0 0% 9%;           /* near-black #171717 */
--foreground: 0 0% 93%;          /* off-white #ECECEC */
--card: 0 0% 11%;                /* charcoal #1C1C1C */
--card-foreground: 0 0% 93%;
--popover: 0 0% 11%;
--popover-foreground: 0 0% 93%;
--primary: 0 0% 93%;
--primary-foreground: 0 0% 9%;
--secondary: 0 0% 15%;           /* #262626 */
--secondary-foreground: 0 0% 93%;
--muted: 0 0% 15%;
--muted-foreground: 0 0% 55%;    /* mid gray #8C8C8C */
--accent: 0 0% 15%;
--accent-foreground: 0 0% 93%;
--destructive: 0 62.8% 40%;
--destructive-foreground: 0 0% 93%;
--border: 0 0% 18%;              /* dark gray #2D2D2D */
--input: 0 0% 18%;
--ring: 0 0% 60%;
--chart-1: 178 70% 50%;          /* teal #1DB8A0 */
--chart-2: 197 50% 55%;
--chart-3: 167 70% 55%;
--chart-4: 349 52% 65%;
--chart-5: 43 96% 65%;
```

Preserve existing Erwin-specific additions (`--warning`, `--warning-foreground`, `--success`, FullCalendar overrides) — don't blow them away.

---

## Parallelization Plan

These six tasks split cleanly into three independent groups:

| Agent | Tasks | Files touched |
|-------|-------|---------------|
| A | 1 (routing) + 2 (nav) + 5 (branding) | middleware.ts, (open)/page.open.tsx, AppNav.tsx, metadata.ts, auth pages, setup page, SignInForm.tsx |
| B | 3 (scheduler bug) | TaskSchedulingService.ts, TimeSlotManager.ts |
| C | 4 (default hours) + 6 (theme) | TaskSchedulingService.ts (DEFAULT_AUTO_SCHEDULE_CREATE only), globals.css |

Agent B and C both touch `TaskSchedulingService.ts` — but different parts: Agent B touches `scheduleTask`/`findAvailableSlots` call sites; Agent C touches only the `DEFAULT_AUTO_SCHEDULE_CREATE` constant. Assign to separate agents and merge manually if conflict arises, or run C after B.

---

## Out of Scope

- Renaming files, components, or internal identifiers to "Erwin"
- Progress tab / dashboard (not built yet)
- Focus Mode keyboard shortcuts
- Stage 2 ranker
- Favicon
