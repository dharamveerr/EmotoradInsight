"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TreeListProps {
  selectedTreeId: string | null;
  onSelectTree: (id: string) => void;
  onNewTree: () => void;
  onPublishTree: (id: string) => Promise<void>;
  onDeleteTree: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export default function TreeList({
  selectedTreeId,
  onSelectTree,
  onNewTree,
  onPublishTree,
  onDeleteTree,
  onRefresh,
}: TreeListProps) {
  const { data, isLoading, mutate } = useSWR("/api/trees", fetcher);
  const trees = data?.trees || [];
  const [deleting, setDeleting] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);

  const handlePublish = async (id: string) => {
    setPublishing(id);
    try {
      await onPublishTree(id);
      mutate();
    } finally {
      setPublishing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tree?")) return;
    setDeleting(id);
    try {
      await onDeleteTree(id);
      mutate();
      if (selectedTreeId === id) onNewTree();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="w-56 bg-white/5 border-r border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Saved Trees</p>
        <button
          onClick={onNewTree}
          className="w-full px-3 py-1.5 bg-green-500/20 border border-green-500/40 text-green-300 text-xs font-semibold rounded hover:bg-green-500/30 transition-colors"
        >
          + New Tree
        </button>
      </div>

      {/* Tree List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="text-xs text-gray-500 text-center py-8">Loading…</div>
        ) : trees.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-8">No trees yet</div>
        ) : (
          trees.map((tree: any) => (
            <div
              key={tree.id}
              onClick={() => onSelectTree(tree.id)}
              className={`p-3 rounded-lg border transition-all cursor-pointer group ${
                selectedTreeId === tree.id
                  ? "bg-blue-500/20 border-blue-500/40"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              {/* Tree name + status */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-gray-200 truncate flex-1">{tree.name}</p>
                <span className="text-lg leading-none">
                  {tree.status === "published" ? "●" : "○"}
                </span>
              </div>

              {/* Status + date */}
              <p className="text-xs text-gray-500 mb-2">
                {tree.status === "published" ? "Published" : "Draft"} •{" "}
                {new Date(tree.created_at).toLocaleDateString()}
              </p>

              {/* Actions */}
              {selectedTreeId === tree.id && (
                <div className="flex gap-1">
                  {tree.status === "draft" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePublish(tree.id);
                      }}
                      disabled={publishing === tree.id}
                      className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors disabled:opacity-50"
                    >
                      {publishing === tree.id ? "…" : "Publish"}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(tree.id);
                    }}
                    disabled={deleting === tree.id}
                    className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {deleting === tree.id ? "…" : "Delete"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
