"use client";

import useSWR from "swr";
import { JOURNEY_LABELS, JOURNEY_STEPS } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export type JourneyConfigClient = {
  labels: Record<string, string>;
  steps: Record<string, string[]>;
  tree: { id: string; name: string } | null;
  isLoading: boolean;
};

/**
 * Journey labels/steps for dashboards. Served from the published tree;
 * falls back to the static Emotorad config while loading or when no tree
 * is published.
 */
export function useJourneyConfig(): JourneyConfigClient {
  // Called from nearly every dashboard page, so this is the single biggest
  // multiplier of polling requests in the app. The published tree changes
  // rarely (only on manual publish), so a long interval is safe — SWR still
  // revalidates on tab focus, and any page navigation picks up fresh data.
  const { data, isLoading } = useSWR("/api/journey-config", fetcher, {
    refreshInterval: 300000,
  });

  return {
    labels: data?.labels || JOURNEY_LABELS,
    steps: data?.steps || JOURNEY_STEPS,
    tree: data?.tree || null,
    isLoading,
  };
}
