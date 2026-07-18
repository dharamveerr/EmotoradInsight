"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";

// Mobile drawer state — shared between Sidebar (renders drawer) and
// Topbar (renders hamburger). Both are mounted in the same React tree
// (DashboardLayout), so a context is the cleanest way to share it.
const MobileNavCtx = createContext<{
  open: boolean;
  toggle: () => void;
  close: () => void;
}>({ open: false, toggle: () => {}, close: () => {} });

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavCtx.Provider value={{ open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }}>
      {children}
    </MobileNavCtx.Provider>
  );
}

export function useMobileNav() {
  return useContext(MobileNavCtx);
}

type NavItem = { href: string; label: string; icon: React.ReactNode };

const overviewItem: NavItem = {
  href: "/",
  label: "Overview",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
};

// "Journey Insights" is now an expandable group — clicking it reveals the
// report pages nested below. The children are the journey-analytics reports.
const journeyGroupIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" /><path d="M9 8h6v6H9z" />
  </svg>
);

const journeyChildren: NavItem[] = [
  overviewItem,
  {
    href: "/product-insights",
    label: "Journey Insights",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-6" />
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
    href: "/variable-report",
    label: "Variable Report",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h7" /><circle cx="18" cy="15" r="3" />
      </svg>
    ),
  },
];

const createTreeItem: NavItem = {
  href: "/create-journey",
  label: "Create Tree",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M12 2v20" /><path d="M2 12h20" /><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
    </svg>
  ),
};

const agentItems = [
  {
    href: "/agent-statistics",
    label: "Agent Statistics",
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

const superAdminItems = [
  {
    href: "/client-list",
    label: "Client List",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18" /><path d="M8 14h2" /><path d="M14 14h2" /><path d="M8 17h2" /><path d="M14 17h2" />
      </svg>
    ),
  },
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

function NavLink({ item, active, collapsed, onLinkClick, indent }: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onLinkClick?: () => void;
  indent?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onLinkClick}
      title={collapsed ? item.label : undefined}
      className={`group flex items-center gap-3 rounded-xl text-sm transition-all relative overflow-hidden ${
        indent ? "px-3 py-2.5" : "px-3.5 py-3"
      } ${collapsed ? "justify-center" : ""} ${
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
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function SidebarContent({
  collapsed,
  onCollapse,
  onLinkClick,
}: {
  collapsed: boolean;
  onCollapse?: () => void;
  onLinkClick?: () => void;
}) {
  const pathname = usePathname();
  const user = useCurrentUser();
  const isSuperAdmin = user?.role === "super_admin";
  const perms = user?.permissions || [];
  // Show each report group only to those who hold its permission (super admin
  // sees all). Journey group → journey_analytics, Agent Statistics → agent_statistics.
  const hasJourney = isSuperAdmin || perms.includes("journey_analytics");
  const hasAgent = isSuperAdmin || perms.includes("agent_statistics");
  const brandName = isSuperAdmin ? "chatbot.team" : (user?.clientName || "chatbot.team");

  // Journey Insights group: collapsible. Auto-open when on a child route.
  const journeyChildActive = journeyChildren.some((c) => pathname === c.href);
  const [journeyOpen, setJourneyOpen] = useState(journeyChildActive);
  useEffect(() => { if (journeyChildActive) setJourneyOpen(true); }, [journeyChildActive]);

  return (
    <div className="flex flex-col h-full">
      {/* Glow accent */}
      <div className="absolute top-0 left-0 w-full h-32 bg-green-500/5 blur-3xl pointer-events-none" />

      {/* Desktop collapse toggle */}
      {onCollapse && (
        <button
          onClick={onCollapse}
          title={collapsed ? "Expand" : "Collapse"}
          className="collapse-btn absolute -right-3.5 top-8 z-20 w-7 h-7 rounded-full bg-slate-800 border border-white/10 text-gray-300 hover:text-white hover:bg-slate-700 flex items-center justify-center shadow-xl transition cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`w-3.5 h-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {/* Header */}
      <div className="px-5 py-6 border-b border-white/5 relative sticky top-0 z-10 shrink-0" style={{ background: "inherit" }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/emotorad-logo.png" alt="Logo" className="w-10 h-10 rounded-xl shrink-0 shadow-lg shadow-blue-500/30" />
          {!collapsed && (
            <div>
              <p className="font-bold text-white text-sm leading-tight">{brandName}</p>
              <p className="text-gray-400 text-xs tracking-wide">Analytics Dashboard</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
        {collapsed ? (
          // Icon-only mode: flatten everything to single icons (no room for a
          // submenu), so every page stays one click away.
          <>
            {hasJourney && journeyChildren.map((c) => (
              <NavLink key={c.href} item={c} active={pathname === c.href} collapsed onLinkClick={onLinkClick} />
            ))}
            {hasJourney && <NavLink item={createTreeItem} active={pathname === createTreeItem.href} collapsed onLinkClick={onLinkClick} />}
            {hasAgent && <NavLink item={agentItems[0]} active={pathname === agentItems[0].href} collapsed onLinkClick={onLinkClick} />}
            {isSuperAdmin && superAdminItems.map((i) => (
              <NavLink key={i.href} item={i} active={pathname === i.href} collapsed onLinkClick={onLinkClick} />
            ))}
          </>
        ) : (
          <>
            {/* Journey Insights — expandable group */}
            {hasJourney && (
              <div>
                <button
                  onClick={() => setJourneyOpen((o) => !o)}
                  className={`group w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all relative overflow-hidden cursor-pointer ${
                    journeyChildActive ? "text-white font-semibold" : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span className={`transition-colors ${journeyChildActive ? "text-green-400" : "text-gray-500 group-hover:text-green-400"}`}>
                    {journeyGroupIcon}
                  </span>
                  <span className="flex-1 text-left">Journey Analytics</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`w-4 h-4 shrink-0 transition-transform ${journeyOpen ? "" : "-rotate-90"}`}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {journeyOpen && (
                  <div className="mt-1 ml-4 pl-3 border-l border-white/10 space-y-1">
                    {journeyChildren.map((c) => (
                      <NavLink key={c.href} item={c} active={pathname === c.href} onLinkClick={onLinkClick} indent />
                    ))}
                  </div>
                )}
              </div>
            )}

            {hasJourney && <NavLink item={createTreeItem} active={pathname === createTreeItem.href} onLinkClick={onLinkClick} />}
            {hasAgent && <NavLink item={agentItems[0]} active={pathname === agentItems[0].href} onLinkClick={onLinkClick} />}
            {isSuperAdmin && superAdminItems.map((i) => (
              <NavLink key={i.href} item={i} active={pathname === i.href} onLinkClick={onLinkClick} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/5 shrink-0">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          {!collapsed && "Live data · auto-refresh"}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { open, close } = useMobileNav();
  const pathname = usePathname();

  // Close mobile drawer on route change
  useEffect(() => { close(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* ── Desktop sidebar (md+) ── */}
      <aside className={`app-sidebar hidden md:flex flex-col shrink-0 bg-gradient-to-b from-slate-950 to-slate-900 border-r border-white/5 sticky top-0 h-screen relative z-20 transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
        <SidebarContent collapsed={collapsed} onCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      {/* ── Mobile overlay backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={close}
        />
      )}

      {/* ── Mobile drawer (slides in from left) ── */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-gradient-to-b from-slate-950 to-slate-900 border-r border-white/5 flex flex-col z-40 md:hidden transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
          aria-label="Close menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <SidebarContent collapsed={false} onLinkClick={close} />
      </aside>
    </>
  );
}
