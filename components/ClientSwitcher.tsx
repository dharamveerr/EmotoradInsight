"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Client = { id: string; name: string };
type ActiveResp = { active: Client | null; role: string; canSwitch: boolean };

// Super admin: dropdown to switch which client's data the dashboard shows.
// Client admin: a static label of their assigned client.
export default function ClientSwitcher() {
  const { data: activeData } = useSWR<ActiveResp>("/api/active-client", fetcher);
  const { data: clientsData } = useSWR<{ clients: Client[] }>("/api/clients", fetcher);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const canSwitch = activeData?.canSwitch;
  const active = activeData?.active || null;
  const clients = clientsData?.clients || [];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
        <span className="text-sm font-medium text-white truncate max-w-[140px]">{active.name}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
        title="Switch client"
      >
        <span className="text-base">🏢</span>
        <span className="text-sm font-medium text-white truncate max-w-[140px]">
          {active ? active.name : "Select client"}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-gray-400">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-64 bg-slate-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in z-50">
          <div className="px-3 py-2 text-[10px] uppercase font-semibold text-gray-500 border-b border-white/5">
            Clients
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {clients.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">No clients yet</div>
            ) : (
              clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => switchTo(c.id)}
                  disabled={busy}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
                    active?.id === c.id
                      ? "bg-green-500/15 text-green-200"
                      : "text-gray-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  {active?.id === c.id && <span className="text-green-400 text-xs">✓ Active</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
