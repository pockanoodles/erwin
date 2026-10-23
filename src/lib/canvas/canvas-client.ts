/**
 * Thin Canvas LMS REST client (read-only). Uses a personal access token.
 *
 * Erwin's one egress to Canvas: everything it reads — courses and grades,
 * assignments and submissions, modules, files, announcements, inbox — comes
 * through here, and nothing here writes. Inbox threads are fetched with
 * `auto_mark_as_read=false` so reading them never marks them read in Canvas.
 */

import type {
  CanvasAnnouncement,
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasConversation,
  CanvasCourse,
  CanvasFile,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
  CanvasQuiz,
  CanvasSubmission,
} from "@/lib/canvas/types";

export interface CanvasClientConfig {
  /** e.g. https://school.instructure.com — no trailing slash */
  baseUrl: string;
  accessToken: string;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function canvasFetch<T>(
  config: CanvasClientConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${normalizeBaseUrl(config.baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
      ...(init?.headers as Record<string, string>),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Canvas API ${res.status}: ${text.slice(0, 200) || res.statusText}`
    );
  }

  return res.json() as Promise<T>;
}

/** Paginated GET (page/per_page) until empty or short page. */
async function canvasFetchAll<T>(
  config: CanvasClientConfig,
  pathWithQuery: string
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  const sep = pathWithQuery.includes("?") ? "&" : "?";

  while (true) {
    const chunk = await canvasFetch<T[]>(
      config,
      `${pathWithQuery}${sep}per_page=100&page=${page}`
    );
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }
    items.push(...chunk);
    if (chunk.length < 100) {
      break;
    }
    page += 1;
  }

  return items;
}

export function createCanvasClient(config: CanvasClientConfig) {
  return {
    /** Active enrollments with this student's course grade, the term and the letter scheme. */
    async listActiveCourses(): Promise<CanvasCourse[]> {
      return canvasFetchAll<CanvasCourse>(
        config,
        "/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=term&include[]=grading_scheme"
      );
    },

    async listAssignmentGroups(courseId: number): Promise<CanvasAssignmentGroup[]> {
      return canvasFetchAll<CanvasAssignmentGroup>(
        config,
        `/api/v1/courses/${courseId}/assignment_groups`
      );
    },

    /**
     * Assignments with the current user's submission and, where the instructor
     * shares them, class score statistics.
     */
    async listAssignments(courseId: number): Promise<CanvasAssignment[]> {
      return canvasFetchAll<CanvasAssignment>(
        config,
        `/api/v1/courses/${courseId}/assignments?include[]=submission&include[]=score_statistics`
      );
    },

    /**
     * This student's submissions with grader comments and rubric marks — what
     * the assignment list's embedded submission leaves out.
     */
    async listSubmissions(courseId: number): Promise<CanvasSubmission[]> {
      return canvasFetchAll<CanvasSubmission>(
        config,
        `/api/v1/courses/${courseId}/students/submissions?student_ids[]=self&include[]=submission_comments&include[]=rubric_assessment`
      );
    },

    /** Classic quizzes: time limit, attempts, LockDown Browser. */
    async listQuizzes(courseId: number): Promise<CanvasQuiz[]> {
      return canvasFetchAll<CanvasQuiz>(config, `/api/v1/courses/${courseId}/quizzes`);
    },

    /**
     * Announcements for several courses in one call. Canvas only returns the
     * last two weeks unless given a window, so the caller passes one.
     */
    async listAnnouncements(
      courseIds: number[],
      window: { start: Date; end: Date }
    ): Promise<CanvasAnnouncement[]> {
      if (courseIds.length === 0) {
        return [];
      }
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const contexts = courseIds.map((id) => `context_codes[]=course_${id}`).join("&");
      return canvasFetchAll<CanvasAnnouncement>(
        config,
        `/api/v1/announcements?${contexts}&start_date=${day(window.start)}&end_date=${day(window.end)}`
      );
    },

    /**
     * The newest Inbox threads, newest first. One page is plenty for a
     * sync that runs every few minutes.
     */
    async listConversations(): Promise<CanvasConversation[]> {
      return canvasFetch<CanvasConversation[]>(
        config,
        "/api/v1/conversations?scope=inbox&per_page=50"
      );
    },

    /** One Inbox thread with its messages. Never marks it read. */
    async getConversation(conversationId: number): Promise<CanvasConversation> {
      return canvasFetch<CanvasConversation>(
        config,
        `/api/v1/conversations/${conversationId}?auto_mark_as_read=false`
      );
    },

    /** One course with its syllabus body and term name. */
    async getCourse(courseId: number): Promise<CanvasCourse> {
      return canvasFetch<CanvasCourse>(
        config,
        `/api/v1/courses/${courseId}?include[]=syllabus_body&include[]=term`
      );
    },

    /**
     * Modules in Canvas order, each with its items. Canvas leaves `items` off
     * large modules even when asked, so those are fetched separately.
     */
    async listModules(courseId: number): Promise<CanvasModule[]> {
      const modules = await canvasFetchAll<CanvasModule>(
        config,
        `/api/v1/courses/${courseId}/modules?include[]=items&include[]=content_details`
      );
      for (const m of modules) {
        if (!m.items) {
          m.items = await canvasFetchAll<CanvasModuleItem>(
            config,
            `/api/v1/courses/${courseId}/modules/${m.id}/items?include[]=content_details`
          );
        }
      }
      return modules;
    },

    async getPage(courseId: number, pageSlug: string): Promise<CanvasPage> {
      return canvasFetch<CanvasPage>(
        config,
        `/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageSlug)}`
      );
    },

    /**
     * File metadata. Students can't list a course's files (403), but a file
     * reached from a module or an assignment is readable by id.
     */
    async getFile(courseId: number, fileId: number): Promise<CanvasFile> {
      return canvasFetch<CanvasFile>(
        config,
        `/api/v1/courses/${courseId}/files/${fileId}`
      );
    },

    /**
     * Download a file's bytes from its signed `url`. Streamed, so a large
     * slide deck never sits whole in memory.
     */
    async downloadFile(file: CanvasFile): Promise<ReadableStream<Uint8Array>> {
      if (!file.url) {
        throw new Error(`Canvas file ${file.id} has no download URL`);
      }
      const res = await fetch(file.url, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        throw new Error(`Canvas file download ${res.status}`);
      }
      return res.body;
    },

    /** Smoke test token + base URL. */
    async validateConnection(): Promise<boolean> {
      await canvasFetch<unknown>(config, "/api/v1/users/self/profile");
      return true;
    },
  };
}

export type CanvasClient = ReturnType<typeof createCanvasClient>;
