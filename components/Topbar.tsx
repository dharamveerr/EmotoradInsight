"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import ProfileEditModal from "./ProfileEditModal";
import Avatar from "./Avatar";
import { useCurrentUser } from "@/lib/useCurrentUser";

function UserAvatar({ name, picture }: { name: string; picture: string | null }) {
  return <Avatar name={name} picture={picture} className="w-9 h-9" textClass="text-sm" />;
}

export default function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const roleLabel = user?.role === "super_admin" ? "Super Admin" : user?.role === "admin" ? "Admin" : "Admin";
  const displayName = user?.name || user?.username || "User";

  async function handleLogout() {
    let publicIp: string | null = null;
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const ipData = await ipRes.json();
      publicIp = ipData.ip || null;
    } catch {
      // ignore
    }
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicIp }),
    });
    router.push("/login");
    router.refresh();
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (settingsOpen || profileMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen, profileMenuOpen]);

  return (
    <>
      <header className="app-topbar h-16 border-b border-white/5 bg-slate-950/50 backdrop-blur-xl flex items-center justify-between px-7 shrink-0 sticky top-0 z-20">
        <div>
          <h1 className="text-lg font-bold text-white">{title}</h1>
          {subtitle && <p className="text-xs text-gray-400 tracking-wide mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />

          {/* Profile button — mini menu with edit only */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileMenuOpen((o) => !o)}
              className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              <UserAvatar name={displayName} picture={user?.picture || null} />
              <div className="text-left">
                <p className="text-sm font-medium text-white truncate max-w-[120px]">{displayName}</p>
                <p className="text-xs text-gray-400">{roleLabel}</p>
              </div>
            </button>

            {/* Profile mini menu — edit only */}
            {profileMenuOpen && (
              <div className="absolute right-0 top-12 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl shadow-black/50 overflow-hidden animate-fade-in z-50">
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setEditProfileOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-blue-400">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Profile
                </button>
              </div>
            )}
          </div>

          {/* Settings gear button — full menu */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen((o) => !o)}
              title="Settings"
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                settingsOpen
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {/* Settings dropdown panel */}
            {settingsOpen && (
              <div className="absolute right-0 top-12 w-72 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in z-50">
                {/* Profile section */}
                <div className="p-4 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={displayName} picture={user?.picture || null} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                      {user?.email && (
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      )}
                      <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        user?.role === "super_admin"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-green-500/20 text-green-300 border border-green-500/30"
                      }`}>
                        {user?.role === "super_admin" ? "⭐ Super Admin" : "Admin"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="p-2">
                  <button
                    onClick={() => {
                      setSettingsOpen(false);
                      setEditProfileOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-blue-400">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit Profile
                  </button>

                  <Link
                    href="/user-management"
                    onClick={() => setSettingsOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-emerald-400">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                    Add User
                  </Link>

                  <Link
                    href="/history"
                    onClick={() => setSettingsOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-400">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    History
                  </Link>

                  {user?.role === "super_admin" && (
                    <Link
                      href="/user-management"
                      onClick={() => setSettingsOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-green-400">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Manage Users &amp; Access
                    </Link>
                  )}

                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3 text-sm text-gray-300">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-blue-400">
                        <circle cx="12" cy="12" r="5" />
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                      </svg>
                      Theme
                    </div>
                    <ThemeToggle compact />
                  </div>

                  <div className="border-t border-white/5 mt-1 pt-1">
                    <button
                      onClick={() => { setSettingsOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <path d="M16 17l5-5-5-5" />
                        <path d="M21 12H9" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sign out button */}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-red-400 font-medium transition-colors flex items-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      </header>

      {/* Profile edit modal */}
      {user && (
        <ProfileEditModal
          user={user}
          isOpen={editProfileOpen}
          onClose={() => setEditProfileOpen(false)}
        />
      )}
    </>
  );
}
