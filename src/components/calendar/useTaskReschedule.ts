"use client";

import { brand } from "@/lib/brand";
import { useCallback } from "react";

import type { EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { toast } from "sonner";

import { useTaskStore } from "@/store/task";

/**
 * Drag and resize a task on the calendar to set its time.
 *
 * Shared by all four views because the rule it encodes is not a per-view
 * detail: **a time you set by hand is locked.** Every `updateTask` kicks off a
 * full re-schedule (store/task.ts), and that run nulls `scheduledStart` for
 * every auto-scheduled task that isn't locked before re-slotting it. Writing a
 * time without the lock would therefore persist it and wipe it in the same
 * round trip — the drag would spring back a second later and look like a bug in
 * the calendar rather than a scheduler doing its job.
 *
 * Locking is reversible: the Lock Schedule switch in the task modal hands the
 * task back to the auto-scheduler.
 *
 * Only tasks move. A calendar event belongs to Google/CalDAV and moving it is a
 * provider write with its own failure modes; dragging one here reverts.
 */
export function useTaskReschedule() {
  const updateTask = useTaskStore((s) => s.updateTask);

  const apply = useCallback(
    async (
      info: EventDropArg | EventResizeDoneArg,
      { setDuration }: { setDuration: boolean }
    ) => {
      const taskId = info.event.extendedProps?.taskId ?? info.event.id;
      const start = info.event.start;

      if (!info.event.extendedProps?.isTask || !start) {
        info.revert();
        return;
      }

      // Landing in the all-day row expresses a date, not a time, and there is
      // no scheduled window to write. Dragging *out* of it into the grid is the
      // useful direction and is handled below.
      //
      // Month and year views are all-day by construction, so every drop there
      // lands here — say so, or the chip just springs back with no explanation.
      if (info.event.allDay) {
        info.revert();
        toast("Drop it on a time grid to schedule it", {
          description:
            "An all-day slot sets a date, not a scheduled block. Use the day or week view to give it a time.",
        });
        return;
      }

      // A chip dragged out of the all-day row arrives with no end. Give it the
      // task's own estimate rather than FullCalendar's generic default, so the
      // block you drop is the length the work is supposed to take.
      let end = info.event.end;
      if (!end) {
        // Read the estimate off the task, not extendedProps — the views nest
        // the original item under extendedProps, so duration isn't at the top
        // level there.
        const mins = useTaskStore
          .getState()
          .tasks.find((t) => t.id === taskId)?.duration;
        end = new Date(start.getTime() + (mins && mins > 0 ? mins : 30) * 60000);
      }

      try {
        await updateTask(taskId, {
          scheduledStart: start,
          scheduledEnd: end,
          scheduleLocked: true,
          // Resizing the block is the most direct way to say how long the work
          // takes, so the estimate the scheduler reads follows the handle.
          ...(setDuration
            ? {
                duration: Math.max(
                  1,
                  Math.round((end.getTime() - start.getTime()) / 60000)
                ),
              }
            : {}),
        });
      } catch {
        info.revert();
        toast.error("Couldn't move that task", {
          description: `The time was put back. Check that ${brand.name} is reachable.`,
        });
      }
    },
    [updateTask]
  );

  const handleEventDrop = useCallback(
    (info: EventDropArg) => apply(info, { setDuration: false }),
    [apply]
  );

  const handleEventResize = useCallback(
    (info: EventResizeDoneArg) => apply(info, { setDuration: true }),
    [apply]
  );

  return { handleEventDrop, handleEventResize };
}
