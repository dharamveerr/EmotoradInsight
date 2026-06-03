"use client";

import { useState } from "react";
import useSWR from "swr";
import { Journey } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface JourneyListProps {
  selectedJourneyId: string | null;
  onSelectJourney: (id: string) => void;
  onNewJourney: () => void;
  onPublishJourney: (id: string) => void;
  onDeleteJourney: (id: string) => void;
  onRefresh: () => void;
}

export default function JourneyList({
  selectedJourneyId,
  onSelectJourney,
  onNewJourney,
  onPublishJourney,
  onDeleteJourney,
  onRefresh,
}: JourneyListProps) {
  const { data, isLoading } = useSWR("/api/journeys", fetcher);
  const journeys: Journey[] = data?.journeys || [];
  const [publishing, setPublishing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handlePublish = async (id: string) => {
    setPublishing(id);
    try {
      const res = await fetch(`/api/journeys/${id}/publish`, {
        method: "POST",
      });
      if (res.ok) {
        onRefresh();
        onPublishJourney(id);
      }
    } finally {
      setPublishing(null);
    }
  };

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
        onRefresh();
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
          className="w-full px-3 py-2 text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-all"
        >
          + New
        </button>
      </div>

      {/* Journey List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="text-xs text-gray-500 text-center py-8">Loading…</div>
        ) : journeys.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-8">No journeys yet</div>
        ) : (
          journeys.map((journey: Journey) => (
            <div
              key={journey.id}
              onClick={() => onSelectJourney(journey.id)}
              className={`p-3 rounded border cursor-pointer transition-all group ${
                selectedJourneyId === journey.id
                  ? journey.status === "published"
                    ? "bg-green-500/30 border-green-500/50"
                    : "bg-blue-500/20 border-blue-500/40"
                  : journey.status === "published"
                  ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
                  : journey.status === "draft"
                  ? "bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20"
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
                          ? "bg-green-500/40 text-green-200 border border-green-500/50"
                          : journey.status === "draft"
                          ? "bg-yellow-500/40 text-yellow-200 border border-yellow-500/50"
                          : "bg-blue-500/40 text-blue-200 border border-blue-500/50"
                      }`}
                    >
                      {journey.status === "published" ? "✓ Published" : journey.status === "draft" ? "◉ Draft" : "● Saved"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {journey.steps?.length || 0} steps
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {journey.status === "published" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Unpublish this journey? It will become a draft.")) {
                        handlePublish(journey.id); // Publishing a published journey unpublishes it
                      }
                    }}
                    disabled={publishing === journey.id}
                    className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                    title="Unpublish"
                  >
                    📥
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePublish(journey.id);
                    }}
                    disabled={publishing === journey.id}
                    className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors disabled:opacity-50"
                    title="Publish"
                  >
                    📤
                  </button>
                )}
                {journey.status !== "published" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(journey.id);
                    }}
                    disabled={deleting === journey.id}
                    className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
