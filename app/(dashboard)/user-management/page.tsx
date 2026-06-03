"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import Topbar from "@/components/Topbar";
import SelectGlass from "@/components/SelectGlass";

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
}

interface LoginSession {
  id: string;
  user_id: string | null;
  identifier: string;
  role: string | null;
  action: string;
  timestamp: string;
  ip_address: string | null;
}

function UserAvatar({ name, picture }: { name: string; picture: string | null }) {
  if (picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt={name} className="w-8 h-8 rounded-full object-cover" />;
  }
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
      {initials}
    </div>
  );
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
      {role === "super_admin" ? "⭐ Super Admin" : "Admin"}
    </span>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ username: "", email: "", name: "", password: "", role: "admin" });
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

export default function UserManagementPage() {
  const [tab, setTab] = useState<"users" | "sessions">("users");
  const [showAdd, setShowAdd] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: usersData } = useSWR<{ users: AppUser[] }>("/api/users", fetcher);
  const { data: sessionsData } = useSWR<{ sessions: LoginSession[] }>(
    tab === "sessions" ? "/api/users/sessions" : null,
    fetcher
  );

  const users: AppUser[] = usersData?.users || [];
  const sessions: LoginSession[] = sessionsData?.sessions || [];

  async function toggleAccess(user: AppUser) {
    setUpdatingId(user.id);
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: user.is_active ? 0 : 1 }),
    });
    mutate("/api/users");
    setUpdatingId(null);
  }

  async function changeRole(user: AppUser, newRole: string) {
    setUpdatingId(user.id);
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    mutate("/api/users");
    setUpdatingId(null);
  }

  async function deleteUser(user: AppUser) {
    const name = user.name || user.username || user.email || "this user";
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    await fetch(`/api/users/${user.id}`, { method: "DELETE" });
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

        {/* Users Tab */}
        {tab === "users" && (
          <div className="glass rounded-2xl overflow-hidden animate-fade-in">
            {users.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No users found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">User</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Role</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Last Login</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {users.map((u) => (
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

                        {/* Role cell */}
                        <td className="px-5 py-4">
                          <div className={updatingId === u.id ? "opacity-50 pointer-events-none" : ""}>
                            <SelectGlass
                              value={u.role}
                              onChange={(val) => changeRole(u, val)}
                              options={[
                                { value: "admin", label: "Admin" },
                                { value: "super_admin", label: "Super Admin" },
                              ]}
                            />
                          </div>
                        </td>

                        {/* Status cell */}
                        <td className="px-5 py-4">
                          <button
                            onClick={() => toggleAccess(u)}
                            disabled={updatingId === u.id}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all disabled:opacity-50 ${
                              u.is_active
                                ? "bg-green-500/10 text-green-400 border-green-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                                : "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/30"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? "bg-green-400" : "bg-red-400"}`} />
                            {u.is_active ? "Active" : "Denied"}
                          </button>
                        </td>

                        {/* Last login */}
                        <td className="px-5 py-4 text-xs text-gray-400">
                          {formatDate(u.last_login)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4">
                          <button
                            onClick={() => deleteUser(u)}
                            className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                            title="Delete user"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                              <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                            </svg>
                          </button>
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
              <div className="p-12 text-center text-gray-500">No session history yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">User</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Role</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Action</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">Timestamp</th>
                      <th className="text-left px-5 py-4 text-xs text-gray-500 font-semibold uppercase tracking-wider">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-white/2 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="text-white font-medium">{s.identifier}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          {s.role && <RoleBadge role={s.role} />}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            s.action === "login"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                          }`}>
                            {s.action === "login" ? "→ Login" : "← Logout"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-400">
                          {formatDate(s.timestamp)}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-500 font-mono">
                          {s.ip_address || "—"}
                        </td>
                      </tr>
                    ))}
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
        />
      )}
    </div>
  );
}
