import Sidebar, { MobileNavProvider } from "@/components/Sidebar";
import ActivityTracker from "@/components/ActivityTracker";
import PageLoader from "@/components/PageLoader";
import NoAccess from "@/components/NoAccess";
import { getSession } from "@/lib/auth";
import { getUserAccess, canViewReports } from "@/lib/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Hard gate: a logged-in user with no report permission sees nothing but the
  // pending-access screen. Super admins always pass. Live DB read so granting
  // access takes effect on next navigation without re-login.
  const session = await getSession();
  const access = session ? await getUserAccess(session.username) : null;
  const role = access?.role || session?.role || "admin";
  const permissions = access?.permissions || [];
  if (session && !canViewReports(role, permissions)) {
    return <NoAccess name={session.username} />;
  }

  return (
    <MobileNavProvider>
      <div className="app-shell flex h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative">
        <PageLoader />
        {/* Ambient glow orbs */}
        <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="fixed bottom-0 left-1/3 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden relative z-10">
          <ActivityTracker />
          {children}
        </div>
      </div>
    </MobileNavProvider>
  );
}
