"use client";

import {
  PacketGrade,
  PacketInstructions,
  PacketMaterials,
  PacketRubric,
  PacketStatus,
  TaskPacketPane,
  useTaskPacket,
} from "@/components/packet/TaskPacket";

import type { FocusQueueTask } from "@/lib/sigwald/parse-task";

/**
 * Courses' task slots (src/modules/client.tsx): how a Canvas assignment
 * reads in Focus and in the task sheet. Each one fetches the packet
 * (sanitized instructions, rubric, materials); the fetch is shared, so
 * drawing several costs one request.
 */

/** Focus's work column: grade rules, instructions and rubric. A Canvas
 *  description is raw HTML, so it's never printed as text. */
export function CanvasTaskBody({ task }: { task: FocusQueueTask }) {
  const packet = useTaskPacket(task.id, task.source);
  if (!packet.data) {
    return (
      <div className="mt-4">
        <PacketStatus loading={packet.loading} error={packet.error} />
      </div>
    );
  }
  return (
    <>
      {/* Quiz rules before the instructions: a timed, one-attempt
          LockDown exam changes how you start it. */}
      <PacketGrade packet={packet.data} className="mt-4 max-w-[68ch]" />
      <PacketInstructions
        html={packet.data.instructionsHtml}
        className="mt-4"
      />
      <PacketRubric rubric={packet.data.rubric} className="mt-6 max-w-[68ch]" />
    </>
  );
}

/** Focus's context column: the materials the assignment needs. Loading
 *  and errors are reported once, in the work column. */
export function CanvasTaskContext({ task }: { task: FocusQueueTask }) {
  const packet = useTaskPacket(task.id, task.source);
  if (!packet.data) return null;
  return (
    <div className="border-t border-border py-3">
      <PacketMaterials materials={packet.data.materials} />
    </div>
  );
}

/** The task sheet's reading pane: the whole packet in one column. */
export function CanvasTaskPane({ taskId }: { taskId: string }) {
  return <TaskPacketPane taskId={taskId} source="CANVAS" />;
}
