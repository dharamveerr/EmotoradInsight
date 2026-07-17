"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";
import Avatar from "@/components/Avatar";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AppUser {
  id: string;
  username: string | null;
  email: string | null;
  name: string | null;
  picture: string | null;
  role: string;
  is_active: number;
  created_at: string;
  last_login: string | null;
  client_id: string | null;
  client_name: string | null;
  client_ids: string | null; // JSON array of client IDs
  permissions: string | null; // JSON array string, e.g. ["journey_analytics"]
}

interface Client {
  id: string;
  name: string;
  subdomain?: string;
}

interface LoginSession {
  id: string;
  user_id: string | null;
  identifier: string;
  role: string | null;
  action: string;           // 'login' | 'logout' | 'visit'
  page: string | null;      // for visit actions
  page_label: string | null;
  timestamp: string;
  ip_address: string | null;
  client_name: string | null;
}

function UserAvatar({ name, picture }: { name: string; picture: string | null }) {
  return <Avatar name={name} picture={picture} className="w-8 h-8" textClass="text-xs" />;
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
        role === "super_admin"
          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
          : "bg-green-500/20 text-green-300 border border-green-500/30"
      }`}
    >
      {role === "super_admin" ? "Super Admin" : "Admin"}
    </span>
  );
}

function SortHeader({
  label, k, sortKey, sortDir, onSort,
}: {
  label: string;
  k: "name" | "role" | "client" | "status" | "last_login";
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: "name" | "role" | "client" | "status" | "last_login") => void;
}) {
  const active = sortKey === k;
  return (
    <th className="text-left px-5 py-4">
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
          active ? "text-white" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        {label}
        <span className={`text-[9px] leading-none ${active ? "text-green-400" : "text-gray-600"}`}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}

function SessionSortHeader({
  label, k, sortKey, sortDir, onSort,
}: {
  label: string;
  k: "user" | "client" | "page" | "timestamp";
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (k: "user" | "client" | "page" | "timestamp") => void;
}) {
  const active = sortKey === k;
  return (
    <th className="text-left px-5 py-4">
      <button
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
          active ? "text-white" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        {label}
        <span className={`text-[9px] leading-none ${active ? "text-green-400" : "text-gray-600"}`}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}

function AddUserModal({ onClose, onCreated, clients }: { onClose: () => void; onCreated: () => void; clients: Client[] }) {
  const [form, setForm] = useState({ username: "", email: "", name: "", password: "", role: "admin", client_ids: [] as string[], journeyAnalytics: false, agentStatistics: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleClientId(id: string) {
    setForm((f) => {
      const next = f.client_ids.includes(id) ? f.client_ids.filter((x) => x !== id) : [...f.client_ids, id];
      return { ...f, client_ids: next };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { journeyAnalytics, agentStatistics, client_ids, ...rest } = form;
    const permissions = [
      ...(journeyAnalytics ? ["journey_analytics"] : []),
      ...(agentStatistics ? ["agent_statistics"] : []),
    ];
    const payload = { ...rest, client_ids, client_id: client_ids[0] || null, permissions };
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to create user");
    } else {
      onCreated();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="cl-modal bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-fade-in">
        {/* Modal header */}
        <div className="flex items-start justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-green-500/30 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" className="w-5 h-5">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M22 11h-6" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Add New User</h3>
              <p className="text-xs text-gray-400 mt-0.5">Grant dashboard access with role-based permissions</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors mt-0.5 shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="john_doe"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="john@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Display Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="John Doe"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Password <span className="text-red-400">*</span></label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Role</label>
            <SelectGlass
              value={form.role}
              onChange={(val) => setForm((f) => ({ ...f, role: val }))}
              options={[
                { value: "admin", label: "Admin" },
                { value: "super_admin", label: "Super Admin" },
              ]}
              className="w-full"
            />
          </div>

          {form.role !== "super_admin" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Clients</label>
              <div className="max-h-36 overflow-y-auto space-y-1 rounded-xl border border-white/10 bg-white/3 p-2">
                {clients.length === 0 ? (
                  <p className="text-xs text-gray-500 px-1 py-1">No clients yet</p>
                ) : clients.map((c) => {
                  const checked = form.client_ids.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleClientId(c.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors text-left ${
                        checked ? "bg-purple-500/15 text-purple-200" : "text-gray-300 hover:bg-white/5"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-purple-500 border-purple-400" : "border-white/20"}`}>
                        {checked && <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" className="w-3 h-3"><path d="M2 6l3 3 5-5"/></svg>}
                      </span>
                      <span className="font-mono text-xs">{c.subdomain || c.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">User can switch between all assigned clients.</p>
            </div>
          )}

          {form.role !== "super_admin" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Report Access</label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, journeyAnalytics: !f.journeyAnalytics }))}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all ${
                    form.journeyAnalytics
                      ? "bg-green-500/10 border-green-500/40 text-green-300"
                      : "bg-white/5 border-white/10 text-gray-300 hover:border-white/20"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M3 3v18h18" /><path d="M19 9l-5 5-4-4-3 3" />
                    </svg>
                    Journey Analytics
                  </span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors ${form.journeyAnalytics ? "bg-green-500" : "bg-white/15"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.journeyAnalytics ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, agentStatistics: !f.agentStatistics }))}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all ${
                    form.agentStatistics
                      ? "bg-green-500/10 border-green-500/40 text-green-300"
                      : "bg-white/5 border-white/10 text-gray-300 hover:border-white/20"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Agent Statistics
                  </span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors ${form.agentStatistics ? "bg-green-500" : "bg-white/15"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.agentStatistics ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Without any access, the user can log in but sees no reports.</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/20 text-sm font-medium text-gray-200 hover:text-white hover:border-white/40 transition-all"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="cl-create-btn flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-semibold text-white border border-slate-500/50 shadow-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer"
            >
              {loading ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Per-row action icons. Role + Client open a small picker popover; Grant/Deny
// and Delete fire directly. Replaces the old single kebab menu.
function parseClientIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter(Boolean) : []; } catch { return []; }
}

function RowActionsMenu({
  user, clients, isSuperAdmin, busy, onChangeRole, onChangeClients, onToggle, onTogglePerm, onDelete,
}: {
  user: AppUser;
  clients: Client[];
  isSuperAdmin: boolean;
  busy: boolean;
  onChangeRole: (u: AppUser, role: string) => void;
  onChangeClients: (u: AppUser, clientIds: string[]) => void;
  onToggle: (u: AppUser) => void;
  onTogglePerm: (u: AppUser, key: string) => void;
  onDelete: (u: AppUser) => void;
}) {
  const [menu, setMenu] = useState<"role" | "client" | "more" | null>(null);
  // Local multi-select state for client picker — synced when menu opens
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [portalPos, setPortalPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPortalPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
      if (menu === "client") {
        setPendingIds(parseClientIds(user.client_ids));
      }
    } else {
      setPortalPos(null);
    }
  }, [menu, user.client_ids]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (
        ref.current && !ref.current.contains(t) &&
        portalRef.current && !portalRef.current.contains(t)
      ) setMenu(null);
    }
    if (menu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menu]);

  // Client admins can't mutate other users
  if (!isSuperAdmin) return <span className="text-xs text-gray-600">—</span>;

  const pick = (fn: () => void) => { fn(); setMenu(null); };

  return (
    <div className="relative flex items-center justify-end gap-2" ref={ref}>
      {/* Role — blue pill */}
      <button
        onClick={() => setMenu((m) => (m === "role" ? null : "role"))}
        disabled={busy}
        title="Change role"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 shadow-sm ${
          menu === "role"
            ? "bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-indigo-500/50 shadow-lg ring-1 ring-indigo-400/30"
            : "bg-blue-500/12 text-blue-500 hover:bg-gradient-to-r hover:from-indigo-500 hover:to-blue-600 hover:text-white hover:shadow-lg hover:shadow-indigo-500/50 hover:ring-1 hover:ring-indigo-400/30"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <span>Role</span>
      </button>

      {/* Client — purple pill (not for super admins) */}
      {user.role !== "super_admin" && (
        <button
          onClick={() => setMenu((m) => (m === "client" ? null : "client"))}
          disabled={busy}
          title="Assign client"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 shadow-sm ${
            menu === "client"
              ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-violet-500/50 shadow-lg ring-1 ring-violet-400/30"
              : "bg-purple-500/12 text-purple-500 hover:bg-gradient-to-r hover:from-violet-500 hover:to-purple-600 hover:text-white hover:shadow-lg hover:shadow-violet-500/50 hover:ring-1 hover:ring-violet-400/30"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0">
            <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
            <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
          </svg>
          <span>Client</span>
        </button>
      )}
      {/* placeholder to keep 3-dot aligned when client btn hidden */}
      {user.role === "super_admin" && <div className="w-[72px]" />}

      {/* More — access toggle + delete tucked in a 3-dot menu */}
      <button
        onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
        disabled={busy}
        title="More"
        className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${menu === "more" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/10"}`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {/* Popovers — rendered via portal so they escape overflow:hidden table containers */}
      {menu && portalPos && typeof document !== "undefined" && createPortal(
        <div
          ref={portalRef}
          style={{ position: "fixed", top: portalPos.top, right: portalPos.right, zIndex: 9999 }}
          className="w-52 bg-slate-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in"
        >
          {menu === "more" && (
            <div className="p-1">
              {user.role !== "super_admin" && (() => {
                const perms = parseUserPerms(user.permissions);
                const ja = perms.includes("journey_analytics");
                const as = perms.includes("agent_statistics");
                return (
                  <>
                    <button
                      onClick={() => pick(() => onTogglePerm(user, "journey_analytics"))}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                        ja ? "text-amber-300 hover:bg-amber-500/10" : "text-green-300 hover:bg-green-500/10"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M3 3v18h18" /><path d="M19 9l-5 5-4-4-3 3" />
                      </svg>
                      {ja ? "Revoke Journey Analytics" : "Grant Journey Analytics"}
                    </button>
                    <button
                      onClick={() => pick(() => onTogglePerm(user, "agent_statistics"))}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                        as ? "text-amber-300 hover:bg-amber-500/10" : "text-green-300 hover:bg-green-500/10"
                      }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      {as ? "Revoke Agent Statistics" : "Grant Agent Statistics"}
                    </button>
                  </>
                );
              })()}
              <button
                onClick={() => pick(() => onToggle(user))}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  user.is_active ? "text-amber-300 hover:bg-amber-500/10" : "text-green-300 hover:bg-green-500/10"
                }`}
              >
                {user.is_active ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <circle cx="12" cy="12" r="10" /><path d="M4.9 4.9l14.2 14.2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" />
                  </svg>
                )}
                {user.is_active ? "Set Inactive" : "Set Active"}
              </button>
              <button
                onClick={() => pick(() => onDelete(user))}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                </svg>
                Delete user
              </button>
            </div>
          )}
          {menu === "role" && (
            <>
              <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase font-semibold text-gray-500">Role</div>
              {(["admin", "super_admin"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => pick(() => onChangeRole(user, r))}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                    user.role === r ? "text-green-300 bg-green-500/10" : "text-gray-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {r === "super_admin" ? "Super Admin" : "Admin"}
                  {user.role === r && <span className="text-xs">✓</span>}
                </button>
              ))}
            </>
          )}
          {menu === "client" && (
            <>
              <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase font-semibold text-gray-500">Clients</div>
              <div className="max-h-52 overflow-y-auto">
                {/* Unassigned shortcut */}
                <button
                  onClick={() => { onChangeClients(user, []); setMenu(null); setPendingIds([]); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    pendingIds.length === 0 ? "text-green-300 bg-green-500/10" : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${pendingIds.length === 0 ? "bg-green-500 border-green-400" : "border-white/20"}`}>
                    {pendingIds.length === 0 && <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" className="w-3 h-3"><path d="M2 6l3 3 5-5"/></svg>}
                  </span>
                  Unassigned
                </button>
                {clients.map((c) => {
                  const checked = pendingIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        const next = checked ? pendingIds.filter((x) => x !== c.id) : [...pendingIds, c.id];
                        setPendingIds(next);
                        onChangeClients(user, next);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        checked ? "text-purple-200 bg-purple-500/15" : "text-gray-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-purple-500 border-purple-400" : "border-white/20"}`}>
                        {checked && <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" className="w-3 h-3"><path d="M2 6l3 3 5-5"/></svg>}
                      </span>
                      <span className="font-mono text-xs">{c.subdomain || c.name}</span>
                    </button>
                  );
                })}
              </div>
              {pendingIds.length > 0 && (
                <div className="px-3 py-2 border-t border-white/5 text-[10px] text-gray-500">
                  {pendingIds.length} client{pendingIds.length !== 1 ? "s" : ""} assigned
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

type SortKey = "name" | "role" | "client" | "status" | "last_login";
type SessionSortKey = "user" | "client" | "page" | "timestamp";

// Local date as YYYY-MM-DD for date inputs (avoids UTC off-by-one)
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const todayStr = localDateStr();

// Parse app_users.permissions JSON array string into string[].
function parseUserPerms(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export default function UserManagementPage() {
  const [tab, setTab] = useState<"users" | "sessions">("users");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAdd, setShowAdd] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [warning, setWarning] = useState("");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState(""); // "" all | clientId | "none"
  // Session History tab: independent search + sort + date range
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionSortKey, setSessionSortKey] = useState<SessionSortKey>("timestamp");
  const [sessionSortDir, setSessionSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState(todayStr); // YYYY-MM-DD — default current day
  const [dateTo, setDateTo] = useState(todayStr);     // YYYY-MM-DD

  // Auto-dismiss the warning banner after 5 seconds
  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(""), 5000);
    return () => clearTimeout(t);
  }, [warning]);

  const { data: meData } = useSWR<{ role: string }>("/api/me", fetcher);
  const isSuperAdmin = meData?.role === "super_admin";
  const { data: usersData } = useSWR<{ users: AppUser[] }>("/api/users", fetcher);
  const { data: clientsData } = useSWR<{ clients: Client[] }>("/api/clients", fetcher);
  const clients: Client[] = clientsData?.clients || [];
  const { data: sessionsData } = useSWR<{ sessions: LoginSession[] }>(
    tab === "sessions" ? "/api/users/sessions" : null,
    fetcher
  );

  const users: AppUser[] = usersData?.users || [];
  const sessions: LoginSession[] = sessionsData?.sessions || [];

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  function sortVal(u: AppUser, k: SortKey): string | number {
    switch (k) {
      case "name": return (u.name || u.username || u.email || "").toLowerCase();
      case "role": return u.role;
      case "client": return u.role === "super_admin" ? "All clients" : (u.client_name || "~unassigned");
      case "status": return u.is_active ? 1 : 0;
      case "last_login": return u.last_login ? new Date(u.last_login).getTime() : 0;
    }
  }

  const q = search.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    // Client filter
    if (clientFilter === "none") { if (u.client_id || u.role === "super_admin") return false; }
    else if (clientFilter && u.client_id !== clientFilter) return false;
    // Search across name / username / email
    if (q && ![u.name, u.username, u.email].some((f) => (f || "").toLowerCase().includes(q))) return false;
    return true;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSessionSort(k: SessionSortKey) {
    if (sessionSortKey === k) setSessionSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSessionSortKey(k); setSessionSortDir(k === "timestamp" ? "desc" : "asc"); }
  }

  function sessionSortVal(s: LoginSession, k: SessionSortKey): string | number {
    switch (k) {
      case "user": return (s.identifier || "").toLowerCase();
      case "client": return (s.client_name || "~").toLowerCase();
      case "page": return (s.page_label || s.page || "~").toLowerCase();
      case "timestamp": return new Date(s.timestamp).getTime();
    }
  }

  const sq = sessionSearch.trim().toLowerCase();
  // Date range bounds (inclusive). dateTo covers the whole selected day.
  const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
  const filteredSessions = sessions.filter((s) => {
    if (sq && ![s.identifier, s.client_name, s.page_label, s.page].some(
      (f) => (f || "").toLowerCase().includes(sq)
    )) return false;
    const t = new Date(s.timestamp).getTime();
    if (fromMs !== null && t < fromMs) return false;
    if (toMs !== null && t > toMs) return false;
    return true;
  });

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    const va = sessionSortVal(a, sessionSortKey), vb = sessionSortVal(b, sessionSortKey);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sessionSortDir === "asc" ? cmp : -cmp;
  });

  async function toggleAccess(user: AppUser) {
    setUpdatingId(user.id);
    setWarning("");
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: user.is_active ? 0 : 1 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setWarning(data.error || "Failed to update user");
    }
    mutate("/api/users");
    setUpdatingId(null);
  }

  async function togglePerm(user: AppUser, key: string) {
    setUpdatingId(user.id);
    setWarning("");
    const current = parseUserPerms(user.permissions);
    const next = current.includes(key)
      ? current.filter((p) => p !== key)
      : [...current, key];
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setWarning(data.error || "Failed to update access");
    }
    mutate("/api/users");
    setUpdatingId(null);
  }

  async function changeRole(user: AppUser, newRole: string) {
    setUpdatingId(user.id);
    setWarning("");
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setWarning(data.error || "Failed to change role");
    }
    mutate("/api/users");
    setUpdatingId(null);
  }

  async function changeClients(user: AppUser, newIds: string[]) {
    setUpdatingId(user.id);
    setWarning("");
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_ids: newIds }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setWarning(data.error || "Failed to assign clients");
    }
    mutate("/api/users");
    setUpdatingId(null);
  }

  async function deleteUser(user: AppUser) {
    const name = user.name || user.username || user.email || "this user";
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    setWarning("");
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setWarning(data.error || "Failed to delete user");
    }
    mutate("/api/users");
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <Topbar title="User Management" subtitle="Manage access and session history" />

      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-7 space-y-6">
        {/* Warning banner */}
        {warning && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm animate-fade-in">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{warning}</span>
            </div>
            <button onClick={() => setWarning("")} className="text-amber-300/70 hover:text-amber-200 font-bold px-2">
              ✕
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
            {(["users", "sessions"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t
                    ? "bg-gradient-to-r from-green-500/20 to-emerald-500/10 text-white border border-green-500/30"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {t === "users" ? "👥 Users" : "🕐 Session History"}
              </button>
            ))}
          </div>

          {tab === "users" && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-sm font-semibold text-white hover:from-green-400 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/20"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add User
            </button>
          )}
        </div>

        {/* Filter bar */}
        {tab === "users" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, username, or email…"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50"
              />
            </div>
            {isSuperAdmin && (
              <SelectGlass
                value={clientFilter}
                onChange={setClientFilter}
                options={[
                  { value: "", label: "All clients" },
                  ...clients.map((c) => ({ value: c.id, label: c.name })),
                  { value: "none", label: "Unassigned" },
                ]}
              />
            )}
            <span className="text-xs text-gray-500 ml-auto">{sortedUsers.length} of {users.length}</span>
          </div>
        )}

        {/* Users Tab */}
        {tab === "users" && (
          <div className="glass rounded-2xl overflow-hidden animate-fade-in">
            {!usersData ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {[...Array(7)].map((_, i) => (
                        <th key={`header-${i}`} className="px-5 py-4"><div className="skeleton h-3 w-16 rounded"></div></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[...Array(5)].map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        {[...Array(7)].map((_, j) => (
                          <td key={`cell-${j}`} className="px-5 py-4"><div className="skeleton h-4 w-20 rounded"></div></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : sortedUsers.length === 0 ? (
              <div className="p-12 text-center text-gray-500">{users.length === 0 ? "No users found" : "No users match your filters"}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <SortHeader label="User" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortHeader label="Role" k="role" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortHeader label="Client" k="client" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Reports</th>
                      <SortHeader label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortHeader label="Last Login" k="last_login" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <th className="text-center px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sortedUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-white/2 transition-colors">
                        {/* User cell */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <UserAvatar name={u.name || u.username || u.email || "?"} picture={u.picture} />
                            <div>
                              <p className="text-white font-medium">{u.name || u.username || "—"}</p>
                              <p className="text-xs text-gray-500">{u.email || u.username || "—"}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role badge (read-only) */}
                        <td className="px-5 py-4">
                          <RoleBadge role={u.role} />
                        </td>

                        {/* Client badge (read-only) */}
                        <td className="px-5 py-4">
                          {u.role === "super_admin" ? (
                            <span className="text-xs text-gray-500 italic">All clients</span>
                          ) : (() => {
                            const ids = parseClientIds(u.client_ids);
                            if (ids.length === 0) return <span className="text-xs text-gray-500">Unassigned</span>;
                            const assigned = ids.map((id) => clients.find((c) => c.id === id)).filter(Boolean) as Client[];
                            return (
                              <div className="flex flex-wrap gap-1">
                                {assigned.map((c) => (
                                  <span key={c.id} className="inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                                    {c.subdomain || c.name}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Reports access (read-only) */}
                        <td className="px-5 py-4">
                          {u.role === "super_admin" ? (
                            <span className="text-xs text-gray-500 italic">Full access</span>
                          ) : (() => {
                            const perms = parseUserPerms(u.permissions);
                            const chips = [
                              perms.includes("journey_analytics") && { label: "Journey Analytics" },
                              perms.includes("agent_statistics") && { label: "Agent Statistics" },
                            ].filter(Boolean) as { label: string }[];
                            if (chips.length === 0) return (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10">
                                No access
                              </span>
                            );
                            return (
                              <div className="flex flex-wrap gap-1.5">
                                {chips.map((c) => (
                                  <span key={c.label} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/10 text-green-300 border border-green-500/20">
                                    ✓ {c.label}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Status badge (read-only) */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                            u.is_active
                              ? "bg-green-500/10 text-green-400 border-green-500/30"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-green-400" : "bg-red-400"}`} />
                            {u.is_active ? "Active" : "Denied"}
                          </span>
                        </td>

                        {/* Last login */}
                        <td className="px-5 py-4 text-xs text-gray-400">
                          {formatDate(u.last_login)}
                        </td>

                        {/* Actions menu */}
                        <td className="px-5 py-4">
                          <div className="flex justify-end">
                            <RowActionsMenu
                              user={u}
                              clients={clients}
                              isSuperAdmin={!!isSuperAdmin}
                              busy={updatingId === u.id}
                              onChangeRole={changeRole}
                              onChangeClients={changeClients}
                              onToggle={toggleAccess}
                              onTogglePerm={togglePerm}
                              onDelete={deleteUser}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Session History Tab */}
        {tab === "sessions" && (
          <div className="animate-fade-in space-y-4">
            {/* Search + date range filters */}
            {sessionsData && sessions.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    placeholder="Search by user, client, or page…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/30 transition"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 font-medium">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="session-date bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 transition"
                  />
                  <label className="text-xs text-gray-500 font-medium">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="session-date bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 transition"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      onClick={() => { setDateFrom(""); setDateTo(""); }}
                      className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <span className="text-xs text-gray-500 ml-auto">
                  {sortedSessions.length} {sortedSessions.length === 1 ? "entry" : "entries"}
                </span>
              </div>
            )}

            <div className="glass rounded-2xl overflow-hidden">
            {!sessionsData ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {[...Array(7)].map((_, i) => (
                        <th key={`header-${i}`} className="px-5 py-4"><div className="skeleton h-3 w-16 rounded"></div></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[...Array(5)].map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        {[...Array(7)].map((_, j) => (
                          <td key={`cell-${j}`} className="px-5 py-4"><div className="skeleton h-4 w-20 rounded"></div></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No activity yet</div>
            ) : sortedSessions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No entries match your filters</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <SessionSortHeader label="User" k="user" sortKey={sessionSortKey} sortDir={sessionSortDir} onSort={toggleSessionSort} />
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Role</th>
                      <SessionSortHeader label="Client" k="client" sortKey={sessionSortKey} sortDir={sessionSortDir} onSort={toggleSessionSort} />
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Activity</th>
                      <SessionSortHeader label="Page / Detail" k="page" sortKey={sessionSortKey} sortDir={sessionSortDir} onSort={toggleSessionSort} />
                      <SessionSortHeader label="Timestamp" k="timestamp" sortKey={sessionSortKey} sortDir={sessionSortDir} onSort={toggleSessionSort} />
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sortedSessions.map((s) => {
                      const actionMeta =
                        s.action === "login"
                          ? { label: "Login", color: "bg-green-500/10 text-green-400 border-green-500/20", icon: "→" }
                          : s.action === "logout"
                          ? { label: "Logout", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: "←" }
                          : { label: "Visited", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: "◉" };
                      return (
                        <tr key={s.id} className="hover:bg-white/2 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="text-white font-medium">{s.identifier}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            {s.role && <RoleBadge role={s.role} />}
                          </td>
                          <td className="px-5 py-3.5">
                            {s.role === "super_admin" ? (
                              <span className="text-xs text-gray-500 italic">All clients</span>
                            ) : s.client_name ? (
                              <span className="text-xs text-white font-medium">{s.client_name}</span>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${actionMeta.color}`}>
                              <span>{actionMeta.icon}</span>
                              {actionMeta.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            {s.action === "visit" ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-white font-medium">{s.page_label || s.page}</span>
                                <span className="text-[10px] text-gray-600 font-mono">{s.page}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                            {formatDate(s.timestamp)}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-gray-500 font-mono">
                            {s.ip_address || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>
        )}
      </main>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={() => mutate("/api/users")}
          clients={clients}
        />
      )}
    </div>
  );
}
