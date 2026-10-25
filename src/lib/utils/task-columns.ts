import { Prisma } from "@prisma/client";

const TASK_COLUMNS = new Set<string>(Object.values(Prisma.TaskScalarFieldEnum));

/**
 * Task's own columns from a request body. Clients echo whole tasks back, and
 * a task carries what the modules add to it (Courses' courseName, Ladder's
 * ladderGoals): those aren't columns, and Prisma would refuse the write.
 */
export function taskColumnsOnly<T extends Record<string, unknown>>(
  body: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => TASK_COLUMNS.has(key))
  ) as Partial<T>;
}
