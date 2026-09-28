/**
 * Thin Canvas LMS REST client (read-only). Uses a personal access token.
 */

import type {
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasCourse,
  CanvasFile,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
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
    async listActiveCourses(): Promise<CanvasCourse[]> {
      return canvasFetchAll<CanvasCourse>(
        config,
        "/api/v1/courses?enrollment_state=active"
      );
    },

    async listAssignmentGroups(courseId: number): Promise<CanvasAssignmentGroup[]> {
      return canvasFetchAll<CanvasAssignmentGroup>(
        config,
        `/api/v1/courses/${courseId}/assignment_groups`
      );
    },

    /**
     * Assignments including the current user's submission object when available.
     */
    async listAssignments(courseId: number): Promise<CanvasAssignment[]> {
      return canvasFetchAll<CanvasAssignment>(
        config,
        `/api/v1/courses/${courseId}/assignments?include[]=submission`
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
