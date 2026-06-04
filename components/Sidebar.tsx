"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";

const navItems = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    href: "/product-insights",
    label: "Journey Insights",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" /><path d="M9 8h6v6H9z" />
      </svg>
    ),
  },
  {
    href: "/journeys",
    label: "Journey Funnels",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M3 4h18l-7 8v6l-4 2v-8z" />
      </svg>
    ),
  },
  {
    href: "/heatmap",
    label: "Time Heatmap",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/dropoff",
    label: "Drop-off Analysis",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M3 3v18h18" /><path d="M19 9l-5 5-4-4-3 3" />
      </svg>
    ),
  },
  {
    href: "/sessions",
    label: "MIS Report",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="9" /><path d="M10 8l6 4-6 4z" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/create-journey",
    label: "Create Tree",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M12 2v20" /><path d="M2 12h20" /><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
      </svg>
    ),
  },
];

const superAdminItems = [
  {
    href: "/user-management",
    label: "User Management",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const user = useCurrentUser();
  const isSuperAdmin = user?.role === "super_admin";
  const allNavItems = [...navItems, ...(isSuperAdmin ? superAdminItems : [])];

  return (
    <aside className={`app-sidebar shrink-0 bg-gradient-to-b from-slate-950 to-slate-900 border-r border-white/5 flex flex-col sticky top-0 h-screen relative transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
      {/* Glow accent */}
      <div className="absolute top-0 left-0 w-full h-32 bg-green-500/5 blur-3xl pointer-events-none" />

      {/* collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand" : "Collapse"}
        className="collapse-btn absolute -right-3 top-7 z-20 w-6 h-6 rounded-full bg-slate-800 border border-white/10 text-gray-300 hover:text-white hover:bg-slate-700 flex items-center justify-center shadow-lg transition"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`w-3.5 h-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div className="px-5 py-6 border-b border-white/5 relative sticky top-0 z-10" style={{ background: "inherit" }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/emotorad-logo.png" alt="Emotorad" className="w-10 h-10 rounded-xl shrink-0 shadow-lg shadow-blue-500/30" />
          {!collapsed && (
            <div>
              <p className="font-bold text-white text-sm leading-tight">Emotorad</p>
              <p className="text-gray-400 text-xs tracking-wide">Analytics Dashboard</p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1.5">
        {allNavItems.map((item, i) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{ animationDelay: `${i * 0.05}s` }}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all duration-300 animate-slide-in relative overflow-hidden ${collapsed ? "justify-center" : ""} ${
                active
                  ? "bg-gradient-to-r from-green-500/20 to-emerald-500/10 text-white font-semibold border border-green-500/30"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-gradient-to-b from-green-400 to-emerald-500 rounded-r-full" />
              )}
              <span className={`transition-colors ${active ? "text-green-400" : "text-gray-500 group-hover:text-green-400"}`}>
                {item.icon}
              </span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-4 border-t border-white/5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          {!collapsed && "Live data · auto-refresh"}
        </div>
      </div>
    </aside>
  );
}
