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
  const [search, setSearch] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newVarName, setNewVarName] = useState("");
  const [newVarType, setNewVarType] = useState("string");
  const [newVarDesc, setNewVarDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = variables.filter((v: Variable) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddVariable = async () => {
    if (!newVarName.trim()) return;

    setAdding(true);
    try {
      const res = await fetch("/api/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newVarName,
          type: newVarType,
          description: newVarDesc,
        }),
      });

      if (res.ok) {
        mutate();
        setNewVarName("");
        setNewVarType("string");
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
          <p className="text-xs font-semibold text-gray-400 uppercase">Variables</p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition-colors"
            title="Upload variables"
          >
            📤 Upload
          </button>
        </div>
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
        ) : filtered.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-8">No variables</div>
        ) : (
          filtered.map((variable: Variable) => (
            <div
              key={variable.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData("variable", variable.id);
                if (onDragStart) onDragStart(variable.id);
              }}
              className="p-2 bg-green-500/20 border border-green-500/30 rounded cursor-move hover:bg-green-500/30 transition-colors group"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-xs font-mono text-green-300 truncate">
                    {variable.name}
                  </p>
                  <p className="text-xs text-gray-500">{variable.type}</p>
                </div>
                <button
                  onClick={() => handleDeleteVariable(variable.id)}
                  disabled={deleting === variable.id}
                  className="text-xs px-1 py-0.5 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              {variable.description && (
                <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                  {variable.description}
                </p>
              )}
              <p className="text-xs text-gray-600 text-center mt-1">⋮ drag</p>
            </div>
          ))
        )}
      </div>

      {/* Add New Variable */}
      <div className="border-t border-white/10 p-3 space-y-2 shrink-0">
        <input
          type="text"
          value={newVarName}
          onChange={(e) => setNewVarName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddVariable()}
          placeholder="Variable name…"
          className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500/40"
        />
        <select
          value={newVarType}
          onChange={(e) => setNewVarType(e.target.value)}
          className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-green-500/40"
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="select">select</option>
        </select>
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
