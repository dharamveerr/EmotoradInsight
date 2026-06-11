"use client";

import { useState, useEffect, Suspense } from "react";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { useRouter, useSearchParams } from "next/navigation";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: "Google login not set up yet. Add GOOGLE_CLIENT_ID + SECRET to .env.local. Use Username/Password for now.",
  config: "Google OAuth config missing on server.",
  auth_failed: "Google sign-in failed. Try again.",
  invalid_token: "Google token invalid. Try again.",
  no_code: "Google sign-in cancelled.",
};

function EmotoradLogo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/emotorad-logo.png" alt="Emotorad" className="w-20 h-20 select-none" />
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hoverBike, setHoverBike] = useState(false);
  const [parallax, setParallax] = useState(0);

  useEffect(() => {
    setMounted(true);
    const err = searchParams.get("error");
    if (err && GOOGLE_ERRORS[err]) setError(GOOGLE_ERRORS[err]);
  }, [searchParams]);

  function onMove(e: React.MouseEvent) {
    // -1..1 based on cursor x → bike parallax
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    setParallax(x * 18);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Fetch real public IP before login so it gets logged in login_sessions
    let publicIp: string | null = null;
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const ipData = await ipRes.json();
      publicIp = ipData.ip || null;
    } catch {
      // ignore — server will fall back to headers
    }

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, publicIp }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Invalid username or password");
    }
  }

  if (!mounted) return null;

  return (
    <div onMouseMove={onMove} className="login-page min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#020817] via-[#0a1428] to-[#020817] relative overflow-hidden">
      {/* Animated background paths */}
      <BackgroundPaths />

      {/* ambient blue orbs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.2s" }} />
      <div className="absolute top-1/3 right-1/3 w-72 h-72 bg-sky-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />

      {/* faint pulse rings centered */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute rounded-full border border-blue-500/10"
            style={{
              width: `${400 + i * 200}px`,
              height: `${400 + i * 200}px`,
              animation: `ring-pulse 5s ease-out ${i * 0.8}s infinite`,
            }}
          />
        ))}
      </div>

      {/* LEFT gap — interactive bicycle */}
      <div
        className="hidden lg:flex flex-col items-center absolute left-[9%] top-1/2 -translate-y-1/2"
        onMouseEnter={() => setHoverBike(true)}
        onMouseLeave={() => setHoverBike(false)}
      >
        <div
          className="transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${parallax}px) ${hoverBike ? "scale(1.05)" : "scale(1)"}`, animation: "bike-bob 2.5s ease-in-out infinite" }}
        >
          <svg viewBox="0 0 220 140" className="w-64 h-44">
            {/* wheels */}
            {[{ cx: 45 }, { cx: 175 }].map((w, wi) => (
              <g key={wi}>
                <circle cx={w.cx} cy="100" r="32" fill="none" stroke="#3b82f6" strokeWidth="3" opacity="0.7" />
                <g style={{ transformOrigin: `${w.cx}px 100px`, animation: `spin-slow ${hoverBike ? "0.6s" : "2.5s"} linear infinite` }}>
                  {Array.from({ length: 10 }).map((_, i) => {
                    const a = (i * 36 * Math.PI) / 180;
                    return <line key={i} x1={w.cx} y1="100" x2={w.cx + 30 * Math.cos(a)} y2={100 + 30 * Math.sin(a)} stroke="#60a5fa" strokeWidth="1.2" opacity="0.5" />;
                  })}
                </g>
                <circle cx={w.cx} cy="100" r="4" fill="#3b82f6" />
              </g>
            ))}
            {/* frame */}
            <g stroke="#60a5fa" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
              <path d="M45 100 L95 100 L120 55 L75 55 Z" />
              <line x1="95" y1="100" x2="120" y2="55" />
              <line x1="175" y1="100" x2="120" y2="55" />
              <line x1="120" y1="55" x2="128" y2="40" />
              {/* seat post */}
              <line x1="75" y1="55" x2="68" y2="42" />
            </g>
            {/* handlebar */}
            <line x1="124" y1="38" x2="138" y2="38" stroke="#93c5fd" strokeWidth="4" strokeLinecap="round" />
            {/* seat */}
            <line x1="60" y1="42" x2="76" y2="42" stroke="#93c5fd" strokeWidth="5" strokeLinecap="round" />
            {/* pedal crank — spins */}
            <g style={{ transformOrigin: "95px 100px", animation: `spin-slow ${hoverBike ? "0.5s" : "1.8s"} linear infinite` }}>
              <line x1="95" y1="100" x2="95" y2="118" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
              <line x1="95" y1="100" x2="95" y2="82" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
            </g>
            <circle cx="95" cy="100" r="5" fill="#fbbf24" />
          </svg>
        </div>
        {/* motion road line */}
        <div className="w-64 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent mt-1 overflow-hidden relative">
          <span className="absolute inset-y-0 w-10 bg-blue-400/60" style={{ animation: "road-dash 1.2s linear infinite" }} />
        </div>
        <p className="text-blue-400/40 text-xs mt-4 tracking-widest font-semibold">RIDE THE DATA</p>
      </div>

      {/* RIGHT gap — floating particles + lightning */}
      <div className="hidden lg:block absolute right-[12%] top-1/2 -translate-y-1/2 pointer-events-none">
        <svg viewBox="0 0 64 64" className="w-24 h-24 text-blue-400/30 animate-float" fill="currentColor">
          <path d="M38 4 L14 36 H30 L26 60 L50 28 H34 L38 4 Z" />
        </svg>
        <div className="relative w-44 h-44">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="absolute w-2 h-2 rounded-full bg-blue-400/40"
              style={{
                left: `${15 + (i * 37) % 80}%`,
                top: `${10 + (i * 53) % 80}%`,
                animation: `particle-float ${3 + i * 0.5}s ease-in-out ${i * 0.3}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in-scale">
        <div className="glass rounded-3xl p-8 shadow-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
          {/* Logo on white pill for brand contrast */}
          <div className="flex justify-center mb-7">
            <div className="rounded-full shadow-2xl shadow-blue-500/30 animate-float">
              <EmotoradLogo />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white text-center mb-2">Log in or sign up</h2>
          <p className="text-gray-400 text-center mb-7 text-sm">
            Access premium chatbot analytics & journey insights.
          </p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          {/* Provider buttons */}
          <div className="space-y-3 mb-5">
            <a
              href="/api/auth/google/signin"
              onClick={() => setGoogleLoading(true)}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold py-3.5 rounded-full transition-all flex items-center justify-center gap-3"
            >
              {googleLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </a>

            <button
              onClick={() => setError("Phone OTP: use field below or contact admin")}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold py-3.5 rounded-full transition-all flex items-center justify-center gap-3"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Continue with phone
            </button>
          </div>

          {/* OR divider */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-gray-500 text-sm font-medium">OR</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Username + Password */}
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent border border-white/20 rounded-full px-5 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition"
              placeholder="Username"
              required
              autoComplete="off"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border border-white/20 rounded-full px-5 py-3.5 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition"
                placeholder="Password"
                required
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white hover:bg-gray-100 text-slate-900 font-bold py-3.5 rounded-full transition-all shadow-lg disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Continue"}
            </button>
          </form>

          <p className="text-gray-600 text-xs text-center mt-7">
            Secured by OAuth 2.0 · Premium Analytics Dashboard
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fade-in-scale {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in-scale { animation: fade-in-scale 0.5s ease-out; }
        @keyframes ring-pulse {
          0% { opacity: 0.4; transform: scale(0.85); }
          100% { opacity: 0; transform: scale(1.1); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-float { animation: float 3.5s ease-in-out infinite; }
        @keyframes spin-slow { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @keyframes bike-bob { 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-5px); } }
        @keyframes road-dash { from { left: -40px; } to { left: 100%; } }
        @keyframes bar-bounce {
          0%, 100% { transform: scaleY(0.5); opacity: 0.5; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        @keyframes particle-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
          50% { transform: translateY(-20px) scale(1.4); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <LoginInner />
    </Suspense>
  );
}
