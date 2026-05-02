/**
 * Thin Canvas LMS REST client (read-only). Uses a personal access token.
 */

import type {
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasCourse,
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

    /** Smoke test token + base URL. */
    async validateConnection(): Promise<boolean> {
      await canvasFetch<unknown>(config, "/api/v1/users/self/profile");
      return true;
    },
  };
}

export type CanvasClient = ReturnType<typeof createCanvasClient>;
