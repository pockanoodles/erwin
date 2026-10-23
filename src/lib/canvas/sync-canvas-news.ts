/**
 * Course announcements and Canvas Inbox threads for the live courses — where
 * "the exam is open notes" and "class moves to Zoom" actually get said.
 *
 * Announcements come in one call for every course, over a window long enough
 * for a semester (Canvas returns two weeks without one). Inbox threads are
 * read newest first, one page, and only threads sent in a live course are
 * kept; a thread is re-fetched only when it has new messages. Canvas's own
 * read flags are mirrored, never written back. A read that fails leaves what's
 * stored alone and comes back as a problem for the sync to report.
 */
import {
  type ActivityDraft,
  bodyText,
  excerpt,
  oneLine,
} from "@/lib/canvas/activity-plan";
import type { CanvasClient } from "@/lib/canvas/canvas-client";
import { syncProblem } from "@/lib/canvas/sync-problems";
import type { CanvasAnnouncement, CanvasConversation, CanvasCourse } from "@/lib/canvas/types";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CanvasNewsSync";

/** How far back announcements are read. Longer than any term. */
const ANNOUNCEMENT_WINDOW_MS = 150 * 86_400_000;

export interface NewsCourse {
  rowId: string;
  course: CanvasCourse;
}

export interface StoredMessage {
  id: string;
  author: string | null;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface NewsSyncResult {
  announcements: number;
  conversations: number;
  /** Drafts by course row id. */
  activity: Map<string, ActivityDraft[]>;
  /** Reads that failed; the sync reports them. */
  problems: string[];
  /** Course rows whose news didn't fully sync, so they keep their first-sync baseline. */
  incomplete: Set<string>;
}

function storedMessages(value: unknown): StoredMessage[] {
  return Array.isArray(value) ? (value as StoredMessage[]) : [];
}

export async function syncCanvasNews(
  client: CanvasClient,
  courses: NewsCourse[],
  options: { now: Date; selfId: number | null }
): Promise<NewsSyncResult> {
  const { now } = options;
  const activity = new Map<string, ActivityDraft[]>();
  const push = (rowId: string, draft: ActivityDraft) => {
    const list = activity.get(rowId);
    if (list) list.push(draft);
    else activity.set(rowId, [draft]);
  };
  const byContext = new Map(courses.map((c) => [`course_${c.course.id}`, c]));
  let announcementCount = 0;
  let conversationCount = 0;
  const problems: string[] = [];
  const incomplete = new Set<string>();
  const everyCourse = courses.map((c) => c.rowId);
  // A failed read says so: the problem reaches the provider's error, and the
  // courses it covers keep their baseline.
  const fail = (what: string, error: unknown, rowIds: string[]) => {
    problems.push(syncProblem(what, error));
    for (const rowId of rowIds) incomplete.add(rowId);
    logger.error(`Canvas ${what}`, { error: error instanceof Error ? error.message : String(error) }, LOG_SOURCE);
  };

  const window = { start: new Date(now.getTime() - ANNOUNCEMENT_WINDOW_MS), end: new Date(now.getTime() + 86_400_000) };
  let announcements: CanvasAnnouncement[] | null = null;
  try {
    announcements = await client.listAnnouncements(
      courses.map((c) => c.course.id),
      window
    );
  } catch (error) {
    fail("announcements unavailable", error, everyCourse);
  }

  // A failed read leaves what's stored alone; only a successful one prunes.
  if (announcements) {
    for (const { rowId, course } of courses) {
      const mine = announcements.filter((a) => a.context_code === `course_${course.id}`);
      const known = new Set(
        (
          await prisma.courseAnnouncement.findMany({
            where: { courseId: rowId },
            select: { canvasId: true },
          })
        ).map((a) => a.canvasId)
      );
      const readIds: string[] = [];
      for (const a of mine) {
        const canvasId = String(a.id);
        const postedAt = new Date(a.posted_at ?? a.delayed_post_at ?? now);
        const author = a.author?.display_name ?? a.user_name ?? null;
        const readInCanvas = a.read_state === "read";
        const data = {
          title: a.title,
          bodyHtml: a.message ?? null,
          author,
          postedAt,
          htmlUrl: a.html_url ?? null,
          readInCanvas,
          lastSyncedAt: now,
        };
        await prisma.courseAnnouncement.upsert({
          where: { courseId_canvasId: { courseId: rowId, canvasId } },
          create: { courseId: rowId, canvasId, ...data },
          update: data,
        });
        if (readInCanvas) readIds.push(canvasId);
        if (!known.has(canvasId)) {
          const text = excerpt(bodyText(a.message));
          push(rowId, {
            kind: "ANNOUNCEMENT",
            title: a.title,
            detail: author && text ? `${author}: ${text}` : text || author,
            dedupeKey: `announcement:${canvasId}`,
            occurredAt: postedAt,
            target: { announcement: canvasId },
            readInCanvas,
          });
        }
      }
      announcementCount += mine.length;

      await prisma.courseAnnouncement.deleteMany({
        where: {
          courseId: rowId,
          postedAt: { gte: window.start },
          canvasId: { notIn: mine.map((a) => String(a.id)) },
        },
      });
      // Read in Canvas means seen here.
      if (readIds.length > 0) {
        await prisma.courseActivity.updateMany({
          where: { courseId: rowId, seenAt: null, announcement: { canvasId: { in: readIds } } },
          data: { seenAt: now },
        });
      }
    }
  }

  let threads: CanvasConversation[] = [];
  try {
    threads = await client.listConversations();
  } catch (error) {
    fail("inbox unavailable", error, everyCourse);
  }
  for (const thread of threads) {
    const owner = thread.context_code ? byContext.get(thread.context_code) : undefined;
    if (!owner || !thread.last_message_at) {
      continue;
    }
    conversationCount += 1;
    const canvasId = String(thread.id);
    const readInCanvas = thread.workflow_state === "read";
    const prev = await prisma.courseConversation.findUnique({
      where: { courseId_canvasId: { courseId: owner.rowId, canvasId } },
      select: { lastMessageAt: true, messageCount: true, messages: true },
    });
    const lastMessageAt = new Date(thread.last_message_at);
    const unchanged =
      prev &&
      prev.lastMessageAt.getTime() === lastMessageAt.getTime() &&
      prev.messageCount === (thread.message_count ?? 0);

    if (!unchanged) {
      let full: CanvasConversation;
      try {
        full = await client.getConversation(thread.id);
      } catch (error) {
        fail(`inbox thread ${thread.id} unavailable`, error, [owner.rowId]);
        continue;
      }
      const names = new Map((full.participants ?? thread.participants ?? []).map((p) => [p.id, p.name ?? null]));
      const messages: StoredMessage[] = (full.messages ?? [])
        .map((m) => ({
          id: String(m.id),
          author: m.author_id != null ? (names.get(m.author_id) ?? null) : null,
          body: (m.body ?? "").trim(),
          createdAt: m.created_at,
          mine: options.selfId != null && m.author_id === options.selfId,
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const data = {
        subject: thread.subject?.trim() || "(no subject)",
        lastMessageAt,
        messageCount: thread.message_count ?? messages.length,
        messages: JSON.parse(JSON.stringify(messages)),
        lastSyncedAt: now,
      };
      await prisma.courseConversation.upsert({
        where: { courseId_canvasId: { courseId: owner.rowId, canvasId } },
        create: { courseId: owner.rowId, canvasId, ...data },
        update: data,
      });
      const known = new Set(storedMessages(prev?.messages).map((m) => m.id));
      for (const m of messages) {
        if (m.mine || known.has(m.id)) {
          continue;
        }
        push(owner.rowId, {
          kind: "MESSAGE",
          title: data.subject,
          detail: `${m.author ?? "Canvas Inbox"}: ${excerpt(oneLine(m.body))}`,
          dedupeKey: `message:${m.id}`,
          occurredAt: new Date(m.createdAt),
          target: { conversation: canvasId },
          readInCanvas,
        });
      }
    }
    if (readInCanvas) {
      await prisma.courseActivity.updateMany({
        where: { courseId: owner.rowId, seenAt: null, conversation: { canvasId } },
        data: { seenAt: now },
      });
    }
  }

  return { announcements: announcementCount, conversations: conversationCount, activity, problems, incomplete };
}
