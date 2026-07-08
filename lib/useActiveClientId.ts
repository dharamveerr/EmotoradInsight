"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * The currently active client's internal id, client-side. Used to scope
 * per-client localStorage state (e.g. the Variable Report's fetched range) so
 * switching clients never shows another client's cached data/range.
 * Returns undefined while loading, null when no client is active.
 */
export function useActiveClientId(): string | null | undefined {
  const { data } = useSWR<{ active: { id: string } | null }>("/api/active-client", fetcher);
  if (!data) return undefined;
  return data.active?.id ?? null;
}
