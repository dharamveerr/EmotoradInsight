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
}

interface Client {
  id: string;
  name: string;
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

function AddUserModal({ onClose, onCreated, clients }: { onClose: () => void; onCreated: () => void; clients: Client[] }) {
  const [form, setForm] = useState({ username: "", email: "", name: "", password: "", role: "admin", client_id: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-fade-in">
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
              <label className="block text-xs text-gray-400 mb-1.5 font-medium">Client</label>
              <SelectGlass
                value={form.client_id}
                onChange={(val) => setForm((f) => ({ ...f, client_id: val }))}
                options={[
                  { value: "", label: "— No client —" },
                  ...clients.map((c) => ({ value: c.id, label: c.name })),
                ]}
                className="w-full"
              />
              <p className="text-[10px] text-gray-500 mt-1">Client admins only see their assigned client&apos;s data.</p>
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
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-sm font-semibold text-white hover:from-green-400 hover:to-emerald-500 transition-all disabled:opacity-50"
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
function RowActionsMenu({
  user, clients, isSuperAdmin, busy, onChangeRole, onChangeClient, onToggle, onDelete,
}: {
  user: AppUser;
  clients: Client[];
  isSuperAdmin: boolean;
  busy: boolean;
  onChangeRole: (u: AppUser, role: string) => void;
  onChangeClient: (u: AppUser, clientId: string) => void;
  onToggle: (u: AppUser) => void;
  onDelete: (u: AppUser) => void;
}) {
  const [menu, setMenu] = useState<"role" | "client" | "more" | null>(null);
  const [portalPos, setPortalPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPortalPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    } else {
      setPortalPos(null);
    }
  }, [menu]);

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
              <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase font-semibold text-gray-500">Client</div>
              <div className="max-h-48 overflow-y-auto">
                <button
                  onClick={() => pick(() => onChangeClient(user, ""))}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                    !user.client_id ? "text-green-300 bg-green-500/10" : "text-gray-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  Unassigned {!user.client_id && <span className="text-xs">✓</span>}
                </button>
                {clients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pick(() => onChangeClient(user, c.id))}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                      user.client_id === c.id ? "text-green-300 bg-green-500/10" : "text-gray-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {c.name} {user.client_id === c.id && <span className="text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

type SortKey = "name" | "role" | "client" | "status" | "last_login";

export default function UserManagementPage() {
  const [tab, setTab] = useState<"users" | "sessions">("users");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAdd, setShowAdd] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [warning, setWarning] = useState("");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState(""); // "" all | clientId | "none"

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

  async function changeClient(user: AppUser, newClientId: string) {
    setUpdatingId(user.id);
    setWarning("");
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: newClientId || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setWarning(data.error || "Failed to assign client");
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

      <main className="flex-1 p-7 space-y-6">
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
            {sortedUsers.length === 0 ? (
              <div className="p-12 text-center text-gray-500">{users.length === 0 ? "No users found" : "No users match your filters"}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <SortHeader label="User" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortHeader label="Role" k="role" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortHeader label="Client" k="client" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
                          ) : u.client_name ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              {u.client_name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Unassigned</span>
                          )}
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
                              onChangeClient={changeClient}
                              onToggle={toggleAccess}
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
          <div className="glass rounded-2xl overflow-hidden animate-fade-in">
            {sessions.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No activity yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">User</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Role</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Activity</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Page / Detail</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Timestamp</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sessions.map((s) => {
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
