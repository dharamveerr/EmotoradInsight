"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export type Tree = {
  id: string;
  name: string;
  description?: string | null;
  status: "draft" | "published";
  published_at?: string | null;
  journey_count: number;
  created_at: string;
  updated_at: string;
};

interface TreePanelProps {
  selectedTreeId: string | null;
  onSelectTree: (tree: Tree | null) => void;
}

export default function TreePanel({ selectedTreeId, onSelectTree }: TreePanelProps) {
  const { data, isLoading, mutate } = useSWR("/api/trees", fetcher);
  const trees: Tree[] = data?.trees || [];
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createTree() {
    const name = newName.trim();
    if (!name) return;
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/trees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create tree");
        return;
      }
      setNewName("");
      setCreating(false);
      await mutate();
      onSelectTree({ ...data, journey_count: 0 });
    } finally {
      setBusy(null);
    }
  }

  async function publishTree(tree: Tree, unpublish: boolean) {
    setBusy(tree.id);
    setError(null);
    try {
      const res = await fetch(`/api/trees/${tree.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unpublish ? { action: "unpublish" } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to publish tree");
        return;
      }
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  async function deleteTree(tree: Tree) {
    if (!confirm(`Delete tree "${tree.name}" and all its journeys?`)) return;
    setBusy(tree.id);
    setError(null);
    try {
      const res = await fetch("/api/trees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tree.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete tree");
        return;
      }
      if (selectedTreeId === tree.id) onSelectTree(null);
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-60 bg-white/5 border-r border-white/10 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-white/10 shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Trees</p>
        {creating ? (
          <div className="space-y-2">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createTree();
                if (e.key === "Escape") { setCreating(false); setNewName(""); setError(null); }
              }}
              placeholder="Tree name (e.g. Emotorad)"
              className="w-full glass rounded px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500/40"
            />
            <div className="flex gap-1">
              <button
                onClick={createTree}
                disabled={busy === "create" || !newName.trim()}
                className="flex-1 px-2 py-1.5 text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 rounded hover:bg-green-500/30 transition-all disabled:opacity-50"
              >
                {busy === "create" ? "Creating…" : "Create"}
              </button>
              <button
                onClick={() => { setCreating(false); setNewName(""); setError(null); }}
                className="px-2 py-1.5 text-xs bg-gray-500/20 text-gray-300 border border-gray-500/30 rounded hover:bg-gray-500/30 transition-all"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full px-3 py-2 text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 rounded hover:bg-green-500/30 transition-all"
          >
            + New Tree
          </button>
        )}
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="text-xs text-gray-500 text-center py-8">Loading…</div>
        ) : trees.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-8 px-2">
            No trees yet. Create a tree, add journeys inside it, then publish it to power the dashboard.
          </div>
        ) : (
          trees.map((tree) => (
            <div
              key={tree.id}
              onClick={() => onSelectTree(tree)}
              className={`p-3 rounded border cursor-pointer transition-all group ${
                selectedTreeId === tree.id
                  ? tree.status === "published"
                    ? "bg-green-500/30 border-green-500/50"
                    : "bg-blue-500/20 border-blue-500/40"
                  : tree.status === "published"
                  ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🌳</span>
                <p className="text-xs font-semibold text-gray-200 truncate flex-1">{tree.name}</p>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <span
                  className={`text-xs px-2 py-0.5 rounded font-semibold ${
                    tree.status === "published"
                      ? "ls-live bg-green-500/40 text-green-200 border border-green-500/50"
                      : "ls-draft bg-gray-500/30 text-gray-300 border border-gray-500/40"
                  }`}
                >
                  {tree.status === "published" ? "✓ Live" : "● Draft"}
                </span>
                <span className="text-xs text-gray-500">
                  {tree.journey_count} {Number(tree.journey_count) === 1 ? "journey" : "journeys"}
                </span>
              </div>

              <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {tree.status === "published" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Unpublish this tree? Dashboard reverts to default config.")) {
                        publishTree(tree, true);
                      }
                    }}
                    disabled={busy === tree.id}
                    className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                  >
                    📥 Unpublish
                  </button>
                ) : (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        publishTree(tree, false);
                      }}
                      disabled={busy === tree.id}
                      className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors disabled:opacity-50"
                    >
                      📤 Publish
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTree(tree);
                      }}
                      disabled={busy === tree.id}
                      className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50"
                    >
                      🗑
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
