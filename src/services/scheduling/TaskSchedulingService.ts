import { newDate } from "@/lib/date-utils";
import { dueBy } from "@/lib/sigwald/due";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { hiddenTaskSources, visibleSourceWhere } from "@/modules/state";

import { ProjectStatus } from "@/types/project";
import {
  EnergyLevel,
  Priority,
  TaskStatus,
  TaskWithRelations,
  TimePreference,
} from "@/types/task";

import { SchedulingService } from "./SchedulingService";

const LOG_SOURCE = "TaskSchedulingService";

/** Defaults when a user has no row yet (matches setup-migration / first-run expectations). */
const DEFAULT_AUTO_SCHEDULE_CREATE = {
  workDays: "[1,2,3,4,5]",
  workHourStart: 8,
  workHourEnd: 17,
  bufferMinutes: 15,
} as const;

// Define a type for the database result
type DbTaskWithRelations = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  duration: number | null;
  priority: string | null;
  energyLevel: string | null;
  preferredTime: string | null;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
  recurrenceRule: string | null;
  lastCompletedDate: Date | null;
  completedAt: Date | null;
  isRecurring: boolean;
  isAutoScheduled: boolean;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  scheduleScore: number | null;
  lastScheduled: Date | null;
  scheduleLocked: boolean;
  postponedUntil: Date | null;
  userId: string;
  tags: {
    id: string;
    name: string;
    color: string | null;
    userId: string | null;
  }[];
  project: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string | null;
  } | null;
};

/**
 * Convert database task to TaskWithRelations
 */
function convertDbTaskToTaskWithRelations(
  dbTask: DbTaskWithRelations
): TaskWithRelations {
  return {
    ...dbTask,
    status: dbTask.status as TaskStatus,
    priority: dbTask.priority as Priority | null,
    energyLevel: dbTask.energyLevel as EnergyLevel | null,
    preferredTime: dbTask.preferredTime as TimePreference | null,
    tags: dbTask.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color || undefined,
    })),
    project: dbTask.project
      ? {
          ...dbTask.project,
          status: dbTask.project.status as ProjectStatus,
        }
      : null,
  };
}

/**
 * Schedule all tasks for a user
 * @param userId The user ID
 * @returns The updated tasks
 */
export async function scheduleAllTasksForUser(
  userId: string
): Promise<TaskWithRelations[]>;

/**
 * Implementation of scheduleAllTasksForUser
 */
export async function scheduleAllTasksForUser(
  userId: string
): Promise<TaskWithRelations[]> {
  try {
    logger.info("Starting task scheduling for user", { userId }, LOG_SOURCE);

    // If settings are not provided, fetch them from the database
    let userSettings = await prisma.autoScheduleSettings.findUnique({
      where: { userId },
    });

    if (!userSettings) {
      userSettings = await prisma.autoScheduleSettings.create({
        data: {
          userId,
          ...DEFAULT_AUTO_SCHEDULE_CREATE,
        },
      });
      logger.info(
        "Created default auto-schedule settings for user",
        { userId },
        LOG_SOURCE
      );
    }

    // Get all tasks marked for auto-scheduling that are not locked. Tasks
    // from a module that's off aren't placed; any slot one already had stays
    // as it was until the module is back on.
    const now = newDate();
    const hidden = await hiddenTaskSources(userId);
    const tasksToSchedule = await prisma.task.findMany({
      where: {
        isAutoScheduled: true,
        scheduleLocked: false,
        parentTaskId: null,
        status: {
          not: {
            in: [TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS],
          },
        },
        userId,
        OR: [{ postponedUntil: null }, { postponedUntil: { lte: now } }],
        AND: [visibleSourceWhere(hidden)],
      },
      include: {
        project: true,
        tags: true,
      },
    });

    // Get locked tasks (we'll keep their schedules)
    const lockedTasks = await prisma.task.findMany({
      where: {
        isAutoScheduled: true,
        scheduleLocked: true,
        parentTaskId: null,
        status: {
          not: {
            in: [TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS],
          },
        },
        userId,
      },
      include: {
        project: true,
        tags: true,
      },
    });

    logger.info(
      "Found tasks to schedule",
      {
        tasksToScheduleCount: tasksToSchedule.length,
        lockedTasksCount: lockedTasks.length,
      },
      LOG_SOURCE
    );

    // Work hours are interpreted in the user's time zone — resolve it from
    // UserSettings, since this runs server-side (UTC in Docker).
    const tzSettings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    });

    // Initialize scheduling service with settings
    const schedulingService = new SchedulingService(
      userSettings,
      tzSettings?.timeZone
    );

    // Clear existing schedules for non-locked tasks
    await prisma.task.updateMany({
      where: {
        id: {
          in: tasksToSchedule.map((task) => task.id),
        },
        userId,
      },
      data: {
        scheduledStart: null,
        scheduledEnd: null,
        scheduleScore: null,
      },
    });

    // Schedule all tasks against the moment each is due by: a date with no
    // time can still be worked on that day (lib/sigwald/due.ts). Only the
    // schedule is written back, so the stored date stays as it was.
    const timeZone = tzSettings?.timeZone || "UTC";
    const updatedTasks = await schedulingService.scheduleMultipleTasks(
      [...tasksToSchedule, ...lockedTasks].map((task) =>
        task.dueDate
          ? { ...task, dueDate: dueBy(task.dueDate, task.source, timeZone) }
          : task
      ),
      userId
    );

    // Update the lastScheduled timestamp for all tasks
    await prisma.task.updateMany({
      where: {
        id: {
          in: updatedTasks.map((task) => task.id),
        },
      },
      data: {
        lastScheduled: new Date(),
      },
    });

    // Fetch the tasks again with their relations to return
    const dbTasks = (await prisma.task.findMany({
      where: {
        id: {
          in: updatedTasks.map((task) => task.id),
        },
        userId,
      },
      include: {
        tags: true,
        project: true,
      },
    })) as DbTaskWithRelations[];

    // Convert database tasks to TaskWithRelations
    const tasksWithRelations = dbTasks.map(convertDbTaskToTaskWithRelations);

    logger.info(
      "Task scheduling completed successfully",
      { userId, tasksScheduled: updatedTasks.length },
      LOG_SOURCE
    );

    return tasksWithRelations;
  } catch (error) {
    logger.error(
      "Error scheduling tasks",
      {
        error: error instanceof Error ? error.message : String(error),
        userId,
      },
      LOG_SOURCE
    );
    throw error;
  }
}
