"use client";

import { useState } from "react";
import useSWR from "swr";
import { Journey } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface JourneyListProps {
  treeId: string | null;
  selectedJourneyId: string | null;
  onSelectJourney: (id: string) => void;
  onNewJourney: () => void;
  onDeleteJourney: (id: string) => void;
}

export default function JourneyList({
  treeId,
  selectedJourneyId,
  onSelectJourney,
  onNewJourney,
  onDeleteJourney,
}: JourneyListProps) {
  const { data, isLoading, mutate } = useSWR(
    treeId ? `/api/journeys?tree_id=${treeId}` : null,
    fetcher
  );
  const journeys: Journey[] = data?.journeys || [];
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this journey?")) return;

    setDeleting(id);
    try {
      const res = await fetch("/api/journeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        mutate();
        onDeleteJourney(id);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to delete journey");
      }
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="w-56 bg-white/5 border-r border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Journeys</p>
        <button
          onClick={onNewJourney}
          disabled={!treeId}
          className="w-full px-3 py-2 text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New Journey
        </button>
      </div>

      {/* Journey List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!treeId ? (
          <div className="text-xs text-gray-500 text-center py-8 px-2">
            Select or create a tree first. Journeys live inside a tree.
          </div>
        ) : isLoading ? (
          <div className="text-xs text-gray-500 text-center py-8">Loading…</div>
        ) : journeys.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-8 px-2">
            No journeys in this tree yet
          </div>
        ) : (
          journeys.map((journey: Journey) => (
            <div
              key={journey.id}
              onClick={() => onSelectJourney(journey.id)}
              className={`p-3 rounded border cursor-pointer transition-all group ${
                selectedJourneyId === journey.id
                  ? "bg-blue-500/20 border-blue-500/40"
                  : "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-200 truncate">
                    {journey.name}
                  </p>
                  <div className="flex gap-1 mt-1">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${
                        journey.status === "published"
                          ? "ls-live bg-green-500/40 text-green-200 border border-green-500/50"
                          : "ls-draft bg-blue-500/40 text-blue-200 border border-blue-500/50"
                      }`}
                    >
                      {journey.status === "published" ? "✓ Live" : "● Saved"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(journey.id);
                  }}
                  disabled={deleting === journey.id}
                  className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  title="Delete journey"
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
