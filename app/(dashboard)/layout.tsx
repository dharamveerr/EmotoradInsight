import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 relative">
      {/* Ambient glow orbs */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-1/3 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {children}
      </div>
    </div>
  );
}
