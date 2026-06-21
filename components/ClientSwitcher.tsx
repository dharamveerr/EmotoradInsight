"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Client = { id: string; name: string; subdomain?: string | null };
type ActiveResp = { active: Client | null; role: string; canSwitch: boolean };

// Super admin: dropdown to switch which client's data the dashboard shows.
// Client admin: a static label of their assigned client.
export default function ClientSwitcher() {
  const { data: activeData } = useSWR<ActiveResp>("/api/active-client", fetcher);
  const { data: clientsData } = useSWR<{ clients: Client[] }>("/api/clients", fetcher);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const canSwitch = activeData?.canSwitch;
  const active = activeData?.active || null;
  const clients = clientsData?.clients || [];

  // Inline filter by name or subdomain so a long client list stays findable.
  const q = search.trim().toLowerCase();
  const filteredClients = q
    ? clients.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.subdomain || "").toLowerCase().includes(q)
      )
    : clients;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reset the filter whenever the menu closes; focus the box when it opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setSearch("");
  }, [open]);

  async function switchTo(clientId: string) {
    setBusy(true);
    await fetch("/api/active-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    // Full reload so every client-scoped query (insights, sessions, trees,
    // journey-config) refetches under the newly selected client.
    window.location.reload();
  }

  // Client admin (or no switch ability): static label
  if (!canSwitch) {
    if (!active) return null;
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
        <span className="text-base">🏢</span>
        <span className="flex flex-col items-start min-w-0">
          <span className="text-sm font-medium text-white truncate max-w-[160px] leading-tight">{active.name}</span>
          {active.subdomain && (
            <span className="text-[10px] text-gray-400 truncate max-w-[160px] leading-tight">{active.subdomain}</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer"
        title="Switch client"
      >
        <span className="text-base">🏢</span>
        <span className="flex flex-col items-start min-w-0">
          <span className="text-sm font-medium text-white truncate max-w-[160px] leading-tight">
            {active ? active.name : "Select client"}
          </span>
          {active?.subdomain && (
            <span className="text-[10px] text-gray-400 truncate max-w-[160px] leading-tight">{active.subdomain}</span>
          )}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-gray-400 shrink-0">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="ls-dropdown absolute right-0 top-11 w-64 bg-slate-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in z-50">
          <div className="px-3 pt-2 pb-2 border-b border-white/5">
            <p className="text-[10px] uppercase font-semibold text-gray-500 mb-2">Clients</p>
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or subdomain…"
                className="ls-search w-full bg-white/10 border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500/40"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {clients.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">No clients yet</div>
            ) : filteredClients.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">No match for “{search}”</div>
            ) : (
              filteredClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => switchTo(c.id)}
                  disabled={busy}
                  className={`ls-item w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
                    active?.id === c.id
                      ? "ls-active bg-green-500/15 text-green-300"
                      : "text-gray-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="flex flex-col items-start min-w-0">
                    <span className="truncate">{c.name}</span>
                    {c.subdomain && (
                      <span className="text-[10px] text-gray-500 truncate font-normal">{c.subdomain}</span>
                    )}
                  </span>
                  {active?.id === c.id && <span className="text-green-400 text-xs shrink-0">✓ Active</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
