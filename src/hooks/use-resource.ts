"use client";

import { useEffect, useState } from "react";

/**
 * GET-and-cache for read-only JSON the materials surfaces share. Arrowing
 * through a sheet asks for the same packet again and again, so answers are
 * kept for the session (keyed by URL) and a second ask while one is in
 * flight joins it instead of firing another request. `invalidate` drops
 * entries after a sync.
 */
const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

function load<T>(url: string): Promise<T> {
  const running = inflight.get(url);
  if (running) return running as Promise<T>;
  const request = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as T;
      cache.set(url, json);
      return json;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}

export function invalidateResources(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useResource<T>(url: string | null): Resource<T> {
  const cached = url ? ((cache.get(url) as T | undefined) ?? null) : null;
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({
    url,
    data: cached,
    error: null,
  });

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) {
      setState({ url, data: cache.get(url) as T, error: null });
      return;
    }
    let live = true;
    setState({ url, data: null, error: null });
    load<T>(url).then(
      (data) => live && setState({ url, data, error: null }),
      (e: unknown) =>
        live && setState({ url, data: null, error: e instanceof Error ? e.message : "Failed to load" })
    );
    return () => {
      live = false;
    };
  }, [url]);

  // A render between the url changing and the effect running would otherwise
  // show the previous task's packet under the new task's row.
  if (state.url !== url) return { data: cached, error: null, loading: Boolean(url) && !cached };
  return { data: state.data, error: state.error, loading: Boolean(url) && !state.data && !state.error };
}
