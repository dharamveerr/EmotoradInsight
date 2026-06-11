"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface HistoryEntry {
  id: string;
  user_id: string | null;
  identifier: string;
  role: string | null;
  action: string; // 'login' | 'logout' | 'visit'
  page: string | null;
  page_label: string | null;
  timestamp: string;
  ip_address: string | null;
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    login: "bg-green-500/15 text-green-300 border-green-500/30",
    logout: "bg-red-500/15 text-red-300 border-red-500/30",
    visit: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  };
  const labels: Record<string, string> = { login: "Login", logout: "Logout", visit: "Page Visit" };
  return (
    <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${styles[action] || styles.visit}`}>
      {labels[action] || action}
    </span>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export default function HistoryPage() {
  const { data, isLoading } = useSWR<{ history: HistoryEntry[] }>("/api/activity", fetcher, {
    refreshInterval: 30000,
  });
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const history = useMemo(() => data?.history || [], [data]);

  const userOptions = useMemo(() => {
    const users = Array.from(new Set(history.map((h) => h.identifier))).sort();
    return [{ value: "all", label: "All Users" }, ...users.map((u) => ({ value: u, label: u }))];
  }, [history]);

  const filtered = useMemo(
    () =>
      history.filter(
        (h) =>
          (userFilter === "all" || h.identifier === userFilter) &&
          (actionFilter === "all" || h.action === actionFilter)
      ),
    [history, userFilter, actionFilter]
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <Topbar title="History" subtitle="User navigation timeline with timestamps & IP addresses" />

      <main className="flex-1 p-7 space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <SelectGlass
            value={userFilter}
            onChange={setUserFilter}
            options={userOptions}
          />
          <SelectGlass
            value={actionFilter}
            onChange={setActionFilter}
            options={[
              { value: "all", label: "All Activity" },
              { value: "visit", label: "Page Visits" },
              { value: "login", label: "Logins" },
              { value: "logout", label: "Logouts" },
            ]}
          />
          <span className="text-xs text-gray-500 ml-auto">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · auto-refreshes every 30s
          </span>
        </div>

        {/* Timeline table */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-gray-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5 font-semibold">User</th>
                  <th className="px-5 py-3.5 font-semibold">Activity</th>
                  <th className="px-5 py-3.5 font-semibold">Page</th>
                  <th className="px-5 py-3.5 font-semibold">Date &amp; Time</th>
                  <th className="px-5 py-3.5 font-semibold">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="skeleton h-4 w-24 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-gray-500">
                      No activity recorded yet.
                    </td>
                  </tr>
                ) : (
                  filtered.map((h) => (
                    <tr key={h.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-white font-medium">{h.identifier}</span>
                        {h.role && (
                          <span className="block text-[10px] text-gray-500 mt-0.5">
                            {h.role === "super_admin" ? "Super Admin" : "Admin"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <ActionBadge action={h.action} />
                      </td>
                      <td className="px-5 py-3.5 text-gray-300">
                        {h.action === "visit" ? (
                          <>
                            <span className="text-white">{h.page_label || h.page}</span>
                            {h.page && h.page_label && (
                              <span className="block text-[10px] text-gray-500 mt-0.5">{h.page}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-300 whitespace-nowrap">{formatTime(h.timestamp)}</td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-amber-300/90">{h.ip_address || "unknown"}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
