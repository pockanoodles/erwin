/**
 * Example data for a fresh local database: one student's week.
 *
 *   npm run dev:local -- --seed demo
 *
 * Used for trying Sigwald without connecting anything, for UI review, and for
 * the screenshots on the landing page and store listings, where it is
 * labelled as example data. Every date is relative to now, so the week always
 * looks current. The courses, people and places are made up.
 *
 * Refuses to run against anything but a loopback database (the local PGlite
 * that `dev:local` and the desktop app serve), and against a database that
 * already has tasks in it.
 */

import { localDay } from "../../src/lib/date-utils";
import { ensureDesktopUser } from "../../src/lib/desktop/bootstrap";
import { applyGoalRules } from "../../src/lib/sigwald/goal-rules";
import { ensureCurrentHex } from "../../src/lib/sigwald/hex";
import { prisma } from "../../src/lib/prisma";
import { syncWorkoutTask } from "../../src/modules/training/workout";
import { ensureJobFeed, projectShift } from "../../src/modules/work/feed";
import { syncTimesheetTasks } from "../../src/modules/work/timesheet";

const url = process.env.DATABASE_URL ?? "";
// `fluid_calendar` and `erwin` are the database names installs made under the
// earlier names keep, and `sigwald` is the self-host default: all are someone's
// real data, never a demo.
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url) || /\/(fluid_calendar|erwin|sigwald)(\?|$)/.test(url)) {
  throw new Error(`Refusing to seed ${url.replace(/\/\/[^@]*@/, "//…@")}: not a local database`);
}

const DAY = 86_400_000;

function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return new Date(d.getTime() + dayOffset * DAY);
}

/** Offset from today to a weekday this week (0 = Sunday), so classes land on their real days. */
function weekday(day: number, weekShift = 0): number {
  return day - new Date().getDay() + weekShift * 7;
}

async function main() {
  const user = await ensureDesktopUser();
  if ((await prisma.task.count()) > 0) {
    console.log("seed: database already has tasks, leaving it alone");
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { name: "Sam" } });
  const userId = user.id;

  // ── Courses ──────────────────────────────────────────────────────────
  const courses = [
    { canvasId: "demo-cs3500", code: "CS 3500", name: "CS 3500 · Object-Oriented Design" },
    { canvasId: "demo-math2331", code: "MATH 2331", name: "MATH 2331 · Linear Algebra" },
    { canvasId: "demo-engw3302", code: "ENGW 3302", name: "ENGW 3302 · Advanced Writing" },
  ];
  const courseRows = new Map<string, string>();
  for (const c of courses) {
    const row = await prisma.course.create({
      data: { ...c, termName: "Fall 2026", userId, lastSyncedAt: new Date() },
      select: { id: true },
    });
    courseRows.set(c.canvasId, row.id);
  }
  const [cs, math, engw] = courses;
  // The demo is a student's week with goals, so Courses and Stats are on; a
  // fresh install starts with both off.
  await prisma.userModule.create({ data: { userId, moduleId: "courses", enabled: true, position: 0 } });
  await prisma.userModule.create({ data: { userId, moduleId: "ladder", enabled: true, position: 1 } });

  // ── Coursework, shaped like Canvas sync output: a gradebook row per
  // assignment (Canvas's facts) backing the task Focus ranks ─────────────
  const school = (
    course: (typeof courses)[number],
    title: string,
    due: Date,
    opts: { weight: number; points: number; group: string; minutes: number; status?: string; completedAt?: Date }
  ) => ({ course, title, due, ...opts });

  const coursework = [
    school(cs, "Assignment 5: Model-View-Controller refactor", at(2, 23, 59), { weight: 8, points: 100, group: "Homework", minutes: 240 }),
    school(cs, "Lab 7: Builder pattern", at(1, 21, 0), { weight: 2, points: 20, group: "Labs", minutes: 45 }),
    school(cs, "Lab 6: Strategy pattern", at(-3, 21, 0), { weight: 2, points: 20, group: "Labs", minutes: 45, status: "completed", completedAt: at(-3, 19, 40) }),
    school(math, "Homework 6: Eigenvalues and eigenvectors", at(3, 23, 59), { weight: 3, points: 30, group: "Homework", minutes: 120 }),
    school(math, "Exam 2", at(9, 10, 0), { weight: 20, points: 100, group: "Exams", minutes: 90 }),
    school(engw, "Reading response 4", at(-1, 23, 59), { weight: 1, points: 10, group: "Responses", minutes: 30 }),
    school(engw, "Peer review: instruction set", at(1, 17, 0), { weight: 2, points: 10, group: "Peer review", minutes: 40 }),
    school(engw, "Draft: technical description", at(5, 23, 59), { weight: 10, points: 100, group: "Projects", minutes: 180 }),
  ];
  // The sync scales impact so the biggest open piece of coursework is 1.
  const biggest = Math.max(...coursework.filter((w) => w.status !== "completed").map((w) => w.weight));
  const groups = new Map<string, string>();
  for (const [i, w] of coursework.entries()) {
    const courseId = courseRows.get(w.course.canvasId)!;
    const groupKey = `${courseId}:${w.group}`;
    if (!groups.has(groupKey)) {
      const group = await prisma.courseAssignmentGroup.create({
        data: { canvasId: `demo-group-${groups.size + 1}`, name: w.group, position: groups.size, courseId },
        select: { id: true },
      });
      groups.set(groupKey, group.id);
    }
    const canvasId = `demo-${i + 1}`;
    const done = w.status === "completed";
    const task = await prisma.task.create({
      data: {
        title: w.title,
        status: w.status ?? "todo",
        completedAt: w.completedAt ?? null,
        dueDate: w.due,
        duration: w.minutes,
        source: "CANVAS",
        externalTaskId: canvasId,
        category: "SCHOOL",
        impact: w.weight / biggest,
        urgencyTier: "NONE",
        userId,
      },
      select: { id: true },
    });
    await prisma.courseAssignment.create({
      data: {
        canvasId,
        name: w.title,
        dueAt: w.due,
        pointsPossible: w.points,
        submissionTypes: ["online_upload"],
        state: done ? "submitted" : "unsubmitted",
        submittedAt: done ? (w.completedAt ?? null) : null,
        gradeWeightPercent: w.weight,
        lastSyncedAt: new Date(),
        courseId,
        groupId: groups.get(groupKey)!,
        taskId: task.id,
      },
    });
  }

  // ── The current two-month cycle ("hex"), exactly as the app provisions it ──
  const current = await ensureCurrentHex(prisma, userId);
  const cycle = await prisma.goalCycle.update({
    where: { id: current.id },
    data: { theme: "Spring co-op", focusStats: ["intelligence", "endurance"] },
  });
  const coop = await prisma.goal.create({
    data: {
      title: "Land a spring co-op",
      whyItMatters: "Six months of real engineering before senior year.",
      definitionOfDone: "A signed offer for January.",
      importanceScore: 90,
      sortOrder: 0,
      develops: ["intelligence", "faith"],
      cycleId: cycle.id,
      userId,
    },
  });
  await prisma.goal.create({
    data: {
      title: "Send 15 co-op applications",
      isBoss: true,
      targetDate: at(18, 23, 59),
      importanceScore: 85,
      sortOrder: 1,
      develops: ["endurance"],
      cycleId: cycle.id,
      userId,
    },
  });
  const grades = await prisma.goal.create({
    data: {
      title: "Finish CS 3500 with an A",
      importanceScore: 70,
      sortOrder: 2,
      develops: ["intelligence"],
      taskSources: [`course:${cs.canvasId}`],
      cycleId: cycle.id,
      userId,
    },
  });
  const run = await prisma.goal.create({
    data: {
      title: "Run three times a week",
      importanceScore: 40,
      sortOrder: 3,
      develops: ["vigor", "endurance"],
      cycleId: cycle.id,
      userId,
    },
  });

  // ── Personal work, some of it on those goals ─────────────────────────
  const personal = [
    { title: "Email the co-op coordinator about spring placements", minutes: 15, priority: "high", due: at(0, 17, 0), goal: coop.id },
    { title: "Add the robotics project to my résumé", minutes: 60, priority: "medium", due: at(2, 20, 0), goal: coop.id },
    { title: "Apply: software engineering co-op, Boston", minutes: 45, priority: "high", due: at(4, 23, 59), goal: coop.id },
    { title: "Office hours: ask about the MVC grading rubric", minutes: 30, priority: "medium", due: at(1, 15, 0), goal: grades.id },
    { title: "Renew library books", minutes: 10, priority: "low", due: at(2, 18, 0), goal: null },
    { title: "Book a dentist appointment", minutes: 10, priority: "none", due: null, goal: null },
  ];
  // A goal picked by hand is pinned, as the app does it; an unpinned link
  // belongs to the goal rules, which drop it the first time they run.
  for (const p of personal) {
    const task = await prisma.task.create({
      data: {
        title: p.title,
        status: "todo",
        duration: p.minutes,
        priority: p.priority,
        dueDate: p.due,
        category: "PERSONAL",
        goalsPinned: Boolean(p.goal),
        userId,
      },
    });
    if (p.goal) await prisma.taskGoalLink.create({ data: { taskId: task.id, goalId: p.goal } });
  }

  // ── Training: the gym before class, and runs. Sessions as the Training
  // page logs them, then each routine's workout planned the way the app
  // plans it; the running goal claims the runs ──────────────────────────
  await prisma.userModule.create({ data: { userId, moduleId: "training", enabled: true, position: 3 } });
  const lift = (exercise: string, sets: number, reps: number, weight: number | null) => ({ exercise, sets, reps, weight });
  const routines = [
    {
      name: "Push day",
      cadenceDays: 3,
      minutes: 60,
      plan: [{ name: "Bench press", sets: 3, reps: 8 }, { name: "Overhead press", sets: 3, reps: 10 }, { name: "Dips", sets: 3, reps: 12 }],
      sessions: [
        { at: at(-6, 7, 45), note: null, entries: [lift("Bench press", 3, 8, 125), lift("Overhead press", 3, 10, 70), lift("Dips", 3, 10, null)] },
        { at: at(-3, 7, 50), note: "Bench moved fast. Up 5 next time.", entries: [lift("Bench press", 3, 8, 130), lift("Overhead press", 3, 10, 75), lift("Dips", 3, 12, null)] },
      ],
    },
    {
      name: "Pull day",
      cadenceDays: 3,
      minutes: 60,
      plan: [{ name: "Pull-ups", sets: 4, reps: 6 }, { name: "Barbell row", sets: 3, reps: 8 }, { name: "Curls", sets: 3, reps: 12 }],
      sessions: [
        { at: at(-5, 7, 40), note: null, entries: [lift("Pull-ups", 4, 5, null), lift("Barbell row", 3, 8, 115), lift("Curls", 3, 12, 25)] },
        { at: at(-2, 7, 45), note: null, entries: [lift("Pull-ups", 4, 6, null), lift("Barbell row", 3, 8, 120), lift("Curls", 3, 12, 25)] },
      ],
    },
    {
      name: "Long run",
      cadenceDays: 7 / 3,
      minutes: 50,
      plan: [],
      sessions: [
        { at: at(-4, 18, 30), note: "8 km in 46 min", entries: [] },
        { at: at(-1, 18, 15), note: "6 km easy", entries: [] },
      ],
    },
  ];
  for (const r of routines) {
    const routine = await prisma.routine.create({
      data: { name: r.name, cadenceDays: r.cadenceDays, minutes: r.minutes, plan: r.plan, lastDoneAt: r.sessions.at(-1)!.at, createdAt: at(-14, 12), userId },
    });
    for (const s of r.sessions) {
      await prisma.workout.create({
        data: { routineId: routine.id, at: s.at, unit: "lb", note: s.note, entries: { create: s.entries.map((e, position) => ({ ...e, position })) } },
      });
    }
    await syncWorkoutTask(prisma, userId, routine.id);
    if (r.name === "Long run") {
      await prisma.goal.update({ where: { id: run.id }, data: { taskSources: [`routine:${routine.id}`] } });
    }
  }

  // ── Nutrition: targets, the usual foods, and three days of eating ─────
  await prisma.userModule.create({ data: { userId, moduleId: "nutrition", enabled: true, position: 4 } });
  await prisma.nutritionTarget.create({ data: { userId, calories: 2400, protein: 150, carbs: 280, fat: 75 } });
  const foods = [
    { name: "Overnight oats", serving: "1 jar", calories: 380, protein: 18, carbs: 55, fat: 10 },
    { name: "Greek yogurt", serving: "1 cup", calories: 150, protein: 20, carbs: 8, fat: 4 },
    { name: "Protein shake", serving: "1 scoop", calories: 120, protein: 24, carbs: 3, fat: 1.5 },
    { name: "Chicken burrito bowl", serving: "1 bowl", calories: 720, protein: 48, carbs: 70, fat: 24 },
    { name: "Salmon and rice", serving: "1 plate", calories: 640, protein: 40, carbs: 62, fat: 22 },
    { name: "Banana", serving: "1 medium", calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
    { name: "Peanut butter toast", serving: "2 slices", calories: 350, protein: 13, carbs: 34, fat: 18 },
  ];
  const foodRows = new Map<string, { id: string } & (typeof foods)[number]>();
  for (const f of foods) {
    foodRows.set(f.name, { ...f, id: (await prisma.food.create({ data: { ...f, userId }, select: { id: true } })).id });
  }
  const meals: [number, number, string, number][] = [
    [-2, 8, "Overnight oats", 1], [-2, 12, "Chicken burrito bowl", 1], [-2, 16, "Protein shake", 1], [-2, 19, "Salmon and rice", 1], [-2, 21, "Greek yogurt", 1],
    [-1, 8, "Peanut butter toast", 1], [-1, 10, "Banana", 1], [-1, 13, "Chicken burrito bowl", 1], [-1, 17, "Protein shake", 1], [-1, 20, "Salmon and rice", 1.5],
    [0, 8, "Overnight oats", 1], [0, 10, "Protein shake", 1], [0, 12, "Chicken burrito bowl", 1],
  ];
  for (const [offset, hour, name, servings] of meals) {
    const { id, ...food } = foodRows.get(name)!;
    const eatenAt = at(offset, hour);
    await prisma.foodEntry.create({
      data: { ...food, foodId: id, servings, at: eatenAt, day: new Date(`${localDay(eatenAt)}T00:00:00.000Z`), userId },
    });
    await prisma.food.update({ where: { id }, data: { lastUsedAt: eatenAt } });
  }

  // ── Work: a campus job, two weeks of shifts, and a pay period ending
  // today, so its "Submit hours" task is up. One shift is a pickup added by
  // hand; the rest came from the schedule.
  await prisma.userModule.create({ data: { userId, moduleId: "work", enabled: true, position: 5 } });
  const firstDay = localDay(at(-13, 12));
  const job = await prisma.job.create({
    data: {
      userId,
      name: "Rec Center Desk",
      color: "#3E6E8EFF",
      hourlyRate: 16.25,
      payPeriodDays: 14,
      payPeriodStart: new Date(`${firstDay}T00:00:00.000Z`),
      timesheetDueDays: 1,
      timesheetsFrom: new Date(`${localDay(at(-27, 12))}T00:00:00.000Z`),
      weeklyCapHours: 20,
      links: [{ label: "Timesheet", url: "https://example.edu/timesheet" }],
      importKey: "demo",
      contacts: {
        create: [
          { name: "Jamie Ortiz", role: "Desk supervisor", phone: "617-555-0142", email: "j.ortiz@example.edu", position: 0 },
          { name: "Wren Okafor", role: "Facilities manager", phone: "617-555-0199", position: 1 },
        ],
      },
    },
  });
  const feedId = await ensureJobFeed(prisma, job);
  const desk = { title: "Front desk", location: "Rec Center lobby", role: "Desk staff", supervisor: "Jamie Ortiz" };
  const shifts = [
    { ...desk, start: at(-12, 17), end: at(-12, 21), importKey: "w1-a" },
    { ...desk, start: at(-9, 7), end: at(-9, 11), importKey: "w1-b" },
    { ...desk, start: at(-5, 17), end: at(-5, 21, 30), importKey: "w2-a", note: "Stayed to close" },
    { ...desk, title: "Front desk (pickup)", start: at(-2, 12), end: at(-2, 16), importKey: null },
    { ...desk, start: at(1, 17), end: at(1, 21), importKey: "w3-a" },
    { ...desk, start: at(4, 7), end: at(4, 11), importKey: "w3-b" },
  ];
  for (const shift of shifts) {
    await projectShift(prisma, feedId, await prisma.shift.create({ data: { ...shift, jobId: job.id } }));
  }
  await syncTimesheetTasks(prisma, userId);

  // ── Calendars: classes and a life ────────────────────────────────────
  const classes = await prisma.calendarFeed.create({ data: { name: "Classes", type: "LOCAL", color: "#7E513AFF", userId } });
  const life = await prisma.calendarFeed.create({ data: { name: "Personal", type: "LOCAL", color: "#4D6824FF", userId } });

  const meetings: { feed: string; title: string; days: number[]; from: [number, number]; to: [number, number]; location?: string }[] = [
    { feed: classes.id, title: "CS 3500 lecture", days: [1, 4], from: [9, 50], to: [11, 30], location: "West Village H 210" },
    { feed: classes.id, title: "MATH 2331", days: [2, 5], from: [13, 35], to: [14, 40], location: "Ryder Hall 155" },
    { feed: classes.id, title: "ENGW 3302", days: [3], from: [11, 45], to: [13, 25], location: "Holmes Hall 103" },
    { feed: classes.id, title: "CS 3500 lab", days: [3], from: [15, 0], to: [16, 40], location: "Snell Library 033" },
    { feed: life.id, title: "Gym", days: [2, 4], from: [7, 0], to: [8, 0] },
  ];
  for (let week = -1; week <= 1; week++) {
    for (const m of meetings) {
      for (const day of m.days) {
        const offset = weekday(day, week);
        await prisma.calendarEvent.create({
          data: {
            feedId: m.feed,
            title: m.title,
            start: at(offset, m.from[0], m.from[1]),
            end: at(offset, m.to[0], m.to[1]),
            location: m.location ?? null,
            transparency: "OPAQUE",
          },
        });
      }
    }
  }
  const once = [
    { feedId: life.id, title: "Co-op info session", start: at(1, 17, 0), end: at(1, 18, 0), location: "Curry Student Center" },
    { feedId: life.id, title: "Dinner with Maya", start: at(5, 19, 0), end: at(5, 21, 0), location: null },
  ];
  for (const e of once) await prisma.calendarEvent.create({ data: { ...e, transparency: "OPAQUE" } });

  // File coursework under the goals that claim it, as the app does after
  // any change, so the demo opens with its goals already climbing.
  await applyGoalRules(prisma, userId);

  console.log(
    `seed: ${coursework.length + personal.length} tasks, ${courses.length} courses, 4 goals, ${routines.length} routines, ${meals.length} meals, ${shifts.length} shifts, 2 calendars for ${user.email}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
