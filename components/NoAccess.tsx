"use client";

import { useRouter } from "next/navigation";

// Shown to authenticated users who have no report permission yet. They can log
// in but see no analytics until a super admin grants access. Logout only.
export default function NoAccess({ name }: { name?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="glass rounded-3xl p-10 max-w-md w-full text-center border border-white/10 bg-white/[0.03] shadow-2xl">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" className="w-8 h-8">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Access pending</h1>
        <p className="text-sm text-gray-400 leading-relaxed mb-6">
          {name ? <><b className="text-gray-200">{name}</b>, your</> : "Your"} account is active, but
          report access has not been granted yet. An administrator must enable
          Journey Analytics for you before any dashboards appear.
        </p>
        <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-500 mb-6">
          Ask your super admin to grant <b className="text-gray-300">Journey Analytics</b> access from User Management.
        </div>
        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl bg-white hover:bg-gray-100 text-slate-900 font-semibold text-sm transition-all shadow-lg"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
