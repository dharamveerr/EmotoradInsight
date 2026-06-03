"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface VariablePanelProps {
  onDragStart: (variable: string) => void;
}

export default function VariablePanel({ onDragStart }: VariablePanelProps) {
  const { data, isLoading } = useSWR("/api/variables", fetcher);
  const variables = data?.variables || [];
  const [search, setSearch] = useState("");

  const filtered = variables.filter((v: string) =>
    v.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-56 bg-white/5 border-l border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Variables</p>
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
          filtered.map((variable: string) => (
            <div
              key={variable}
              draggable
              onDragStart={(e) => {
                e.dataTransfer?.setData("variable", variable);
                onDragStart(variable);
              }}
              className="p-2 bg-blue-500/20 border border-blue-500/30 rounded cursor-move hover:bg-blue-500/30 transition-colors group"
            >
              <p className="text-xs font-mono text-blue-300 truncate group-hover:text-blue-200">
                {variable}
              </p>
              <p className="text-xs text-gray-500 text-center mt-1">⋮ drag</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
