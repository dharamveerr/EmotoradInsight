"use client";

import { useState } from "react";
import useSWR from "swr";
import { Variable } from "@/lib/types";
import VariableUploadModal from "./VariableUploadModal";
import { useActiveClientId } from "@/lib/useActiveClientId";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type DiscoveredVar = {
  name: string;
  value?: string | null;
  bot_template_id?: string | null;
  is_new?: boolean;
  synced?: boolean;
};

// Session-scoped filter — clears on page refresh, persists across navigation.
let _vrFilter: string[] | null = null;

// Short, readable label for a bot_template_id UUID (first segment).
const shortTpl = (id: string) => `Template ${id.split("-")[0]}`;

interface VariableManagerProps {
  onDragStart?: (variable: string) => void;
}

export default function VariableManager({ onDragStart }: VariableManagerProps) {
  const { data, isLoading, mutate } = useSWR("/api/variables", fetcher);
  const clientId = useActiveClientId();
  const variables: Variable[] = data?.variables || [];
  const discovered: DiscoveredVar[] = data?.discovered || [];
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newVarName, setNewVarName] = useState("");
  const [newVarDesc, setNewVarDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [toast, setToast] = useState("");
  const [vrFilter, setVrFilterState] = useState<string[] | null>(_vrFilter);
  const [vrSyncError, setVrSyncError] = useState<string | null>(null);
  const [panelHidden, setPanelHidden] = useState(false);

  function setVrFilter(v: string[] | null) { _vrFilter = v; setVrFilterState(v); }

  function readPersisted<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { v: T; t: number };
      return parsed?.v ?? null;
    } catch { return null; }
  }

  function handleVrSync() {
    const cid = clientId ?? "none";
    const picked = readPersisted<string[]>(`filter:var-report:picked-vars:${cid}`);
    if (!Array.isArray(picked) || picked.length === 0) {
      setVrSyncError("No variable filter in Variable Report — select variables there first.");
      return;
    }
    setVrSyncError(null);
    setVrFilter(picked);
  }

  function clearVrFilter() { setVrFilter(null); setVrSyncError(null); }

  const matchesSearch = (name: string) => name.toLowerCase().includes(search.toLowerCase());
  const matchesVr = (name: string) => !vrFilter || vrFilter.includes(name);
  const filtered = variables.filter((v: Variable) => matchesSearch(v.name) && matchesVr(v.name));
  // Synced source vars carry a bot_template_id → grouped into per-template
  // sections. Event-derived vars (no template) fall under "From data".
  const syncedVars = discovered.filter((v) => v.bot_template_id && matchesSearch(v.name) && matchesVr(v.name));
  const dataVars = discovered.filter((v) => !v.bot_template_id && matchesSearch(v.name) && matchesVr(v.name));
  const templateGroups = Object.entries(
    syncedVars.reduce<Record<string, DiscoveredVar[]>>((acc, v) => {
      const k = v.bot_template_id as string;
      (acc[k] ||= []).push(v);
      return acc;
    }, {})
  );

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
      setTimeout(async () => {
        // Refetch, then notify with the resulting variable count so the user
        // gets a clear "fetch done" confirmation.
        const fresh = await mutate();
        const count = (fresh?.variables?.length || 0) + (fresh?.discovered?.length || 0);
        setSyncMsg("");
        setToast(count > 0 ? `✓ ${count} variable${count === 1 ? "" : "s"} fetched` : "✓ Sync complete — no variables found");
        setTimeout(() => setToast(""), 4000);
      }, 6000);
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

  if (panelHidden) {
    return (
      <div className="w-5 shrink-0 border-l border-white/10 flex items-start justify-center pt-2">
        <button
          onClick={() => setPanelHidden(false)}
          className="text-gray-500 hover:text-gray-200 transition-colors cursor-pointer"
          title="Show Variables panel"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 shrink-0 bg-white/5 border-l border-white/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase">
            Variables
            <span className="ml-1.5 text-gray-600 normal-case font-normal">
              {vrFilter
                ? `${filtered.length + syncedVars.length + dataVars.length} / ${variables.length + discovered.length}`
                : variables.length + discovered.length}
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
            <button
              onClick={() => setPanelHidden(true)}
              className="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer ml-0.5"
              title="Hide Variables panel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
        {/* Variable Report filter row */}
        <div className="flex items-center gap-2 mb-2">
          {!vrFilter ? (
            <button
              onClick={handleVrSync}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded hover:bg-purple-500/30 transition-colors cursor-pointer"
              title="Show only variables selected in Variable Report"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              Sync Variable Report
            </button>
          ) : (
            <div className="flex-1 flex items-center justify-between gap-2 px-2 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse inline-block" />
                {vrFilter.length} var{vrFilter.length !== 1 ? "s" : ""} from VR
              </span>
              <button onClick={clearVrFilter} className="text-purple-400 hover:text-purple-200 font-bold leading-none" title="Clear filter">×</button>
            </div>
          )}
        </div>
        {vrSyncError && (
          <p className="text-xs text-red-400 mb-2">{vrSyncError}</p>
        )}
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
        ) : filtered.length === 0 && syncedVars.length === 0 && dataVars.length === 0 ? (
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

          {/* Synced source variables — grouped per bot_template_id */}
          {templateGroups.map(([tplId, vars]) => {
            const isCollapsed = collapsed[tplId];
            return (
              <div key={tplId} className="pt-2">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [tplId]: !c[tplId] }))}
                  className="w-full flex items-center justify-between px-1 py-1 text-xs uppercase font-semibold text-gray-400 hover:text-gray-200 transition-colors"
                  title={tplId}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`w-3 h-3 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <span className="truncate">{shortTpl(tplId)}</span>
                  </span>
                  <span className="text-gray-600 normal-case font-normal shrink-0">{vars.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2 mt-1.5">
                    {vars.map((variable) => (
                      <div
                        key={`${tplId}:${variable.name}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer?.setData("variable", variable.name);
                          if (onDragStart) onDragStart(variable.name);
                        }}
                        className={`p-2 rounded cursor-move transition-colors group border ${
                          variable.is_new
                            ? "bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25"
                            : "bg-blue-500/15 border-blue-500/25 hover:bg-blue-500/25"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-mono truncate ${variable.is_new ? "text-amber-300" : "text-blue-300"}`}>
                              {variable.name}
                              {variable.is_new && <span className="ml-1 text-[9px] text-amber-400/80">✨ new</span>}
                            </p>
                            {variable.value != null && variable.value !== "" && (
                              <p className="text-xs text-gray-500 truncate mt-0.5" title={variable.value}>
                                = {variable.value}
                              </p>
                            )}
                          </div>
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
                  </div>
                )}
              </div>
            );
          })}

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

      {/* Sync-complete toast — bottom-right, auto-dismiss */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-2xl shadow-black/40 animate-fade-in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}
