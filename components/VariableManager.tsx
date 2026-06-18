"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Variable } from "@/lib/types";
import VariableUploadModal from "./VariableUploadModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface VariableManagerProps {
  onDragStart?: (variable: string) => void;
}

export default function VariableManager({ onDragStart }: VariableManagerProps) {
  const { data, isLoading, mutate } = useSWR("/api/variables", fetcher);
  const variables: Variable[] = data?.variables || [];
  const discovered: { name: string; is_new?: boolean; synced?: boolean }[] = data?.discovered || [];
  const [search, setSearch] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newVarName, setNewVarName] = useState("");
  const [newVarDesc, setNewVarDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncError, setSyncError] = useState(false);

  const matchesSearch = (name: string) => name.toLowerCase().includes(search.toLowerCase());
  const filtered = variables.filter((v: Variable) => matchesSearch(v.name));
  const newVars = discovered.filter((v) => v.is_new && matchesSearch(v.name));
  const dataVars = discovered.filter((v) => !v.is_new && matchesSearch(v.name));

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/variables/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(true);
        setSyncMsg(data.error || "Sync failed");
        return;
      }
      setSyncError(false);
      // N8N runs the query and posts back asynchronously — give it a moment,
      // then refresh. Show progress so the user knows it's working.
      setSyncMsg("Syncing from source… refreshing shortly");
      setTimeout(() => { mutate(); setSyncMsg(""); }, 6000);
    } catch {
      setSyncError(true);
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteSynced = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    setDeleting(name);
    try {
      const res = await fetch("/api/variables", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) mutate();
      else { const e = await res.json(); alert(e.error || "Failed to delete"); }
    } finally {
      setDeleting(null);
    }
  };

  const handleAddVariable = async () => {
    if (!newVarName.trim()) return;

    setAdding(true);
    try {
      const res = await fetch("/api/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newVarName,
          description: newVarDesc || undefined,
        }),
      });

      if (res.ok) {
        mutate();
        setNewVarName("");
        setNewVarDesc("");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteVariable = async (id: string) => {
    if (!confirm("Delete this variable?")) return;

    setDeleting(id);
    try {
      const res = await fetch("/api/variables", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        mutate();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to delete variable");
      }
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="w-80 bg-white/5 border-l border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">
            Variables
            <span className="ml-1.5 text-gray-600 normal-case font-normal">
              {variables.length + discovered.length}
            </span>
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              title="Fetch latest variables from source (last 15 days)"
            >
              {syncing ? "⏳ Syncing…" : "🔄 Sync"}
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition-colors cursor-pointer"
              title="Upload variables"
            >
              📤 Upload
            </button>
          </div>
        </div>
        {syncMsg && (
          <p className={`text-xs font-medium mb-3 px-3 py-2 rounded-lg border ${syncError ? "text-slate-600 bg-amber-50/60 border-amber-200" : "text-slate-600 bg-emerald-50/60 border-emerald-200"}`}>
            {syncError ? "⚠ " : "✓ "}{syncMsg}
          </p>
        )}
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500/40"
        />
      </div>

      {/* Variable List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="text-xs text-gray-500 text-center py-8">Loading…</div>
        ) : filtered.length === 0 && newVars.length === 0 && dataVars.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-8">No variables</div>
        ) : (
          <>
          {filtered.length > 0 && (
            <p className="text-xs text-gray-600 uppercase font-semibold px-1">Custom</p>
          )}
          {filtered.map((variable: Variable) => (
            <div
              key={variable.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData("variable", variable.id);
                if (onDragStart) onDragStart(variable.id);
              }}
              className="p-2 bg-green-500/20 border border-green-500/30 rounded cursor-move hover:bg-green-500/30 transition-colors group"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-green-300 truncate">
                    {variable.name}
                  </p>
                  {variable.description && (
                    <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                      {variable.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteVariable(variable.id)}
                  disabled={deleting === variable.id}
                  className="text-xs px-1 py-0.5 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 shrink-0"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-600 text-center mt-1">⋮ drag</p>
            </div>
          ))}

          {newVars.length > 0 && (
            <p className="text-xs text-amber-400/80 uppercase font-semibold px-1 pt-2 flex items-center gap-1">
              ✨ New <span className="text-gray-600 normal-case font-normal">from last sync</span>
            </p>
          )}
          {newVars.map((variable) => (
            <div
              key={variable.name}
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData("variable", variable.name);
                if (onDragStart) onDragStart(variable.name);
              }}
              className="p-2 bg-amber-500/15 border border-amber-500/30 rounded cursor-move hover:bg-amber-500/25 transition-colors group"
            >
              <div className="flex justify-between items-start gap-2">
                <p className="text-xs font-mono text-amber-300 truncate flex-1 min-w-0">{variable.name}</p>
                <button
                  onClick={() => handleDeleteSynced(variable.name)}
                  disabled={deleting === variable.name}
                  className="text-xs px-1 py-0.5 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 shrink-0"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-600 text-center mt-1">⋮ drag</p>
            </div>
          ))}

          {dataVars.length > 0 && (
            <p className="text-xs text-gray-600 uppercase font-semibold px-1 pt-2">
              From data
            </p>
          )}
          {dataVars.map((variable) => (
            <div
              key={variable.name}
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData("variable", variable.name);
                if (onDragStart) onDragStart(variable.name);
              }}
              className="p-2 bg-blue-500/15 border border-blue-500/25 rounded cursor-move hover:bg-blue-500/25 transition-colors group"
            >
              <div className="flex justify-between items-start gap-2">
                <p className="text-xs font-mono text-blue-300 truncate flex-1 min-w-0">{variable.name}</p>
                {variable.synced && (
                  <button
                    onClick={() => handleDeleteSynced(variable.name)}
                    disabled={deleting === variable.name}
                    className="text-xs px-1 py-0.5 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 shrink-0"
                    title="Delete"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-600 text-center mt-1">⋮ drag</p>
            </div>
          ))}
          </>
        )}
      </div>

      {/* Add New Variable */}
      <div className="border-t border-white/10 p-3 space-y-2 shrink-0">
        <p className="text-xs text-gray-500">Variable (start with @)</p>
        <input
          type="text"
          value={newVarName}
          onChange={(e) => setNewVarName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddVariable()}
          placeholder="e.g., @customer_name"
          className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500/40"
        />
        <input
          type="text"
          value={newVarDesc}
          onChange={(e) => setNewVarDesc(e.target.value)}
          placeholder="Description (optional)…"
          className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500/40"
        />
        <button
          onClick={handleAddVariable}
          disabled={adding || !newVarName.trim()}
          className="w-full px-3 py-1 bg-green-500/20 text-green-300 rounded font-semibold text-xs hover:bg-green-500/30 transition-colors disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add Variable"}
        </button>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <VariableUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            mutate();
            setShowUploadModal(false);
          }}
        />
      )}
    </div>
  );
}
