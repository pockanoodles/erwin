/**
 * Writes course activity drafts (see `activity-plan.ts`). Each draft names its
 * target by Canvas identity; this resolves them to row ids, applies the
 * first-sync baseline, and inserts — a dedupe key already written is skipped,
 * so re-running a sync never repeats an event.
 */
import { type ActivityDraft, draftsToWrite } from "@/lib/canvas/activity-plan";
import { prisma } from "@/lib/prisma";

export async function recordActivity(
  courseId: string,
  drafts: ActivityDraft[],
  options: { baseline: boolean; now: Date }
): Promise<number> {
  const rows = draftsToWrite(drafts, options);
  if (rows.length === 0) {
    return 0;
  }

  const ids = <K extends keyof NonNullable<ActivityDraft["target"]>>(key: K) => [
    ...new Set(rows.flatMap((r) => (r.target?.[key] ? [r.target[key] as string] : []))),
  ];
  const [assignments, materials, announcements, conversations] = await Promise.all([
    prisma.courseAssignment.findMany({
      where: { courseId, canvasId: { in: ids("assignment") } },
      select: { id: true, canvasId: true },
    }),
    prisma.courseMaterial.findMany({
      where: { courseId, canvasRef: { in: ids("materialRef") } },
      select: { id: true, canvasRef: true },
    }),
    prisma.courseAnnouncement.findMany({
      where: { courseId, canvasId: { in: ids("announcement") } },
      select: { id: true, canvasId: true },
    }),
    prisma.courseConversation.findMany({
      where: { courseId, canvasId: { in: ids("conversation") } },
      select: { id: true, canvasId: true },
    }),
  ]);
  const assignmentId = new Map(assignments.map((r) => [r.canvasId, r.id]));
  const materialId = new Map(materials.map((r) => [r.canvasRef, r.id]));
  const announcementId = new Map(announcements.map((r) => [r.canvasId, r.id]));
  const conversationId = new Map(conversations.map((r) => [r.canvasId, r.id]));

  const { count } = await prisma.courseActivity.createMany({
    data: rows.map((r) => ({
      courseId,
      kind: r.kind,
      title: r.title,
      detail: r.detail,
      dedupeKey: r.dedupeKey,
      occurredAt: r.occurredAt,
      seenAt: r.seen ? options.now : null,
      assignmentId: r.target?.assignment ? (assignmentId.get(r.target.assignment) ?? null) : null,
      materialId: r.target?.materialRef ? (materialId.get(r.target.materialRef) ?? null) : null,
      announcementId: r.target?.announcement
        ? (announcementId.get(r.target.announcement) ?? null)
        : null,
      conversationId: r.target?.conversation
        ? (conversationId.get(r.target.conversation) ?? null)
        : null,
    })),
    skipDuplicates: true,
  });
  return count;
}
