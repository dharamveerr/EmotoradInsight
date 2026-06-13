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
  const { data, isLoading } = useSWR("/api/journey-config", fetcher, {
    refreshInterval: 30000,
  });

  return {
    labels: data?.labels || JOURNEY_LABELS,
    steps: data?.steps || JOURNEY_STEPS,
    tree: data?.tree || null,
    isLoading,
  };
}
