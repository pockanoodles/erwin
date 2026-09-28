/**
 * Server side of `clean-html.ts`: looks up what a course has mirrored locally
 * so its HTML can be cleaned and re-pointed at the mirror.
 */
import { cleanCanvasHtml, type CleanOptions } from "@/lib/canvas/clean-html";
import { prisma } from "@/lib/prisma";

/** Clean-up context for one course, by its Canvas id (what Task.courseId holds). */
export async function cleanOptionsFor(
  userId: string,
  courseCanvasId: string | null
): Promise<CleanOptions> {
  const [provider, course] = await Promise.all([
    prisma.taskProvider.findFirst({
      where: { userId, type: "CANVAS" },
      select: { serverUrl: true },
    }),
    courseCanvasId
      ? prisma.course.findUnique({
          where: { userId_canvasId: { userId, canvasId: courseCanvasId } },
          select: {
            materials: {
              where: { OR: [{ fileCanvasId: { not: null } }, { pageSlug: { not: null } }] },
              select: { id: true, fileCanvasId: true, pageSlug: true, localPath: true },
            },
          },
        })
      : null,
  ]);

  const files = new Map<string, string>();
  const pages = new Map<string, string>();
  for (const m of course?.materials ?? []) {
    if (m.fileCanvasId && m.localPath && !files.has(m.fileCanvasId)) files.set(m.fileCanvasId, m.id);
    if (m.pageSlug && !pages.has(m.pageSlug)) pages.set(m.pageSlug, m.id);
  }

  return {
    courseCanvasId,
    canvasBaseUrl: provider?.serverUrl ?? null,
    targets: { files, pages },
  };
}

export async function cleanCourseHtml(
  userId: string,
  courseCanvasId: string | null,
  html: string | null | undefined
): Promise<string> {
  if (!html) return "";
  return cleanCanvasHtml(html, await cleanOptionsFor(userId, courseCanvasId));
}
