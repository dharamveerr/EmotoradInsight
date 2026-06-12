"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { useRouter, useSearchParams } from "next/navigation";

const GOOGLE_ERRORS: Record<string, string> = {
  google_not_configured: "Google login not set up yet. Add GOOGLE_CLIENT_ID + SECRET to .env.local. Use Username/Password for now.",
  not_registered: "No account found for this Google email. Please sign up first.",
  config: "Google OAuth config missing on server.",
  auth_failed: "Google sign-in failed. Try again.",
  invalid_token: "Google token invalid. Try again.",
  no_code: "Google sign-in cancelled.",
};

// 6-digit OTP input: auto-focuses the first box, advances as digits are
// typed, backspace moves back, paste fills all boxes.
function OtpInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function setDigit(i: number, d: string) {
    const chars = value.padEnd(6, " ").split("");
    chars[i] = d || " ";
    const next = chars.join("").trimEnd().replace(/ /g, "");
    onChange(next);
  }

  return (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[i] || ""}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(-1);
            setDigit(i, d);
            if (d && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (pasted) {
              onChange(pasted);
              refs.current[Math.min(pasted.length, 5)]?.focus();
            }
          }}
          className="w-12 h-14 bg-transparent border border-white/20 rounded-xl text-white text-center text-2xl font-bold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition disabled:opacity-50"
        />
      ))}
    </div>
  );
}

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
  // Login vs Sign Up tab
  const [mode, setMode] = useState<"login" | "signup">("login");
  // Signup flow: email → (consent for new Google users) → code → credentials
  const [signupStep, setSignupStep] = useState<"email" | "consent" | "code" | "credentials">("email");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupBusy, setSignupBusy] = useState(false);
  // Forgot password flow: "" = off, "request" = ask identifier, "reset" = enter code + new password
  const [forgotStep, setForgotStep] = useState<"" | "request" | "reset">("");
  const [forgotId, setForgotId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setMounted(true);
    const err = searchParams.get("error");
    if (err && GOOGLE_ERRORS[err]) setError(GOOGLE_ERRORS[err]);
    // Google sign-in with an unregistered email → ask consent before signing up
    if (searchParams.get("newuser") === "1") {
      setMode("signup");
      setSignupStep("consent");
      setSignupEmail(searchParams.get("email") || "");
    }
  }, [searchParams]);

  async function handleForgotRequest(e: React.FormEvent) {
    e.preventDefault();
    setForgotBusy(true);
    setError("");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: forgotId }),
    });
    const data = await res.json().catch(() => ({}));
    setForgotBusy(false);
    if (res.ok) {
      setMaskedEmail(data.maskedEmail || "your email");
      setForgotStep("reset");
    } else {
      setError(data.error || "Failed to send reset code");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotBusy(true);
    setError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: forgotId, code: resetCode, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setForgotBusy(false);
    if (res.ok) {
      setForgotStep("");
      setForgotId("");
      setResetCode("");
      setNewPassword("");
      setNotice("Password reset successfully. Log in with your new password.");
    } else {
      setError(data.error || "Failed to reset password");
    }
  }

  function exitForgot() {
    setForgotStep("");
    setForgotId("");
    setResetCode("");
    setNewPassword("");
    setError("");
    setNotice("");
  }

  async function requestSignupCode() {
    setSignupBusy(true);
    setError("");
    const res = await fetch("/api/auth/signup/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: signupEmail }),
    });
    const data = await res.json().catch(() => ({}));
    setSignupBusy(false);
    if (res.ok) {
      setSignupCode("");
      setSignupStep("code");
    } else {
      setError(data.error || "Failed to start sign up");
    }
  }

  async function handleVerifyCode(code: string) {
    setSignupBusy(true);
    setError("");
    const res = await fetch("/api/auth/signup/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: signupEmail, code }),
    });
    const data = await res.json().catch(() => ({}));
    setSignupBusy(false);
    if (res.ok) {
      setSignupStep("credentials");
    } else {
      setError(data.error || "Verification failed");
      setSignupCode("");
    }
  }

  async function handleSignupEmail(e: React.FormEvent) {
    e.preventDefault();
    await requestSignupCode();
  }

  async function handleSignupComplete(e: React.FormEvent) {
    e.preventDefault();
    setSignupBusy(true);
    setError("");
    let publicIp: string | null = null;
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      publicIp = (await ipRes.json()).ip || null;
    } catch { /* server falls back to headers */ }

    const res = await fetch("/api/auth/signup/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: signupEmail,
        code: signupCode,
        username: signupUsername,
        password: signupPassword,
        publicIp,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSignupBusy(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(data.error || "Sign up failed");
    }
  }

  function switchMode(m: "login" | "signup") {
    setMode(m);
    setSignupStep("email");
    setSignupCode("");
    setSignupPassword("");
    setError("");
    setNotice("");
  }

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

          {mode === "signup" && !forgotStep ? (
            <>
              <h2 className="text-2xl font-bold text-white text-center mb-2">
                {signupStep === "consent" ? "You're new here!"
                  : signupStep === "code" ? "Verify your email"
                  : signupStep === "credentials" ? "Set your credentials"
                  : "Create your account"}
              </h2>
              <p className="text-gray-400 text-center mb-7 text-sm">
                {signupStep === "email"
                  ? "Enter your email to get started. A verification code will be sent to the Super Admin."
                  : signupStep === "consent"
                  ? <><b className="text-gray-200">{signupEmail}</b> is not registered yet. Would you like to create a new account with this email?</>
                  : signupStep === "code"
                  ? <>Ask the <b className="text-gray-200">Super Admin</b> for the verification code sent for <b className="text-gray-200">{signupEmail}</b>.</>
                  : <>Verified ✓ — now choose how you&apos;ll log in to <b className="text-gray-200">{signupEmail}</b>.</>}
              </p>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
                  {error}
                </div>
              )}

              {signupStep === "consent" ? (
                <div className="space-y-3">
                  <button
                    onClick={requestSignupCode}
                    disabled={signupBusy}
                    className="w-full bg-white hover:bg-gray-100 text-slate-900 font-bold py-3.5 rounded-full transition-all shadow-lg disabled:opacity-50"
                  >
                    {signupBusy ? "Sending code..." : "Yes, create my account"}
                  </button>
                  <button
                    onClick={() => switchMode("login")}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold py-3.5 rounded-full transition-all"
                  >
                    No, back to login
                  </button>
                </div>
              ) : signupStep === "email" ? (
                <>
                <a
                  href="/api/auth/google/signin"
                  onClick={() => setGoogleLoading(true)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold py-3.5 rounded-full transition-all flex items-center justify-center gap-3 mb-5"
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
                  Sign up with Google
                </a>

                <div className="flex items-center gap-4 mb-5">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-gray-500 text-sm font-medium">OR</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <form onSubmit={handleSignupEmail} className="space-y-3">
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full bg-transparent border border-white/20 rounded-full px-5 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition"
                    placeholder="Email (required)"
                    required
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={signupBusy}
                    className="w-full bg-white hover:bg-gray-100 text-slate-900 font-bold py-3.5 rounded-full transition-all shadow-lg disabled:opacity-50"
                  >
                    {signupBusy ? "Sending code..." : "Continue"}
                  </button>
                </form>
                </>
              ) : signupStep === "code" ? (
                <div className="space-y-4">
                  <OtpInput
                    value={signupCode}
                    onChange={(v) => {
                      setSignupCode(v);
                      if (v.length === 6 && !signupBusy) handleVerifyCode(v);
                    }}
                    disabled={signupBusy}
                  />
                  <button
                    onClick={() => signupCode.length === 6 && handleVerifyCode(signupCode)}
                    disabled={signupBusy || signupCode.length !== 6}
                    className="w-full bg-white hover:bg-gray-100 text-slate-900 font-bold py-3.5 rounded-full transition-all shadow-lg disabled:opacity-50"
                  >
                    {signupBusy ? "Verifying..." : "Verify Code"}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSignupComplete} className="space-y-3">
                  <input
                    type="text"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    className="w-full bg-transparent border border-white/20 rounded-full px-5 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition"
                    placeholder="Username (optional — email used if blank)"
                    autoComplete="off"
                    autoFocus
                  />
                  <div className="relative">
                    <input
                      type={showSignupPassword ? "text" : "password"}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="w-full bg-transparent border border-white/20 rounded-full px-5 py-3.5 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition"
                      placeholder="Create password (min 6 characters)"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                    >
                      {showSignupPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={signupBusy}
                    className="w-full bg-white hover:bg-gray-100 text-slate-900 font-bold py-3.5 rounded-full transition-all shadow-lg disabled:opacity-50"
                  >
                    {signupBusy ? "Creating account..." : "Create Account & Log in"}
                  </button>
                </form>
              )}

              <p className="text-center text-sm text-gray-500 mt-6">
                Already have an account?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="text-blue-400 hover:text-blue-300 font-semibold transition"
                >
                  Log in
                </button>
              </p>
            </>
          ) : forgotStep ? (
            <>
              <h2 className="text-2xl font-bold text-white text-center mb-2">Reset password</h2>
              <p className="text-gray-400 text-center mb-7 text-sm">
                {forgotStep === "request"
                  ? "Enter your username or email — we'll send a reset code to your registered email."
                  : <>Code sent to <b className="text-gray-200">{maskedEmail}</b>. Enter it below with your new password.</>}
              </p>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
                  {error}
                </div>
              )}

              {forgotStep === "request" ? (
                <form onSubmit={handleForgotRequest} className="space-y-3">
                  <input
                    type="text"
                    value={forgotId}
                    onChange={(e) => setForgotId(e.target.value)}
                    className="w-full bg-transparent border border-white/20 rounded-full px-5 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition"
                    placeholder="Username or email"
                    required
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="w-full bg-white hover:bg-gray-100 text-slate-900 font-bold py-3.5 rounded-full transition-all shadow-lg disabled:opacity-50"
                  >
                    {forgotBusy ? "Sending..." : "Send Reset Code"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-transparent border border-white/20 rounded-full px-5 py-3.5 text-white text-center text-xl tracking-[0.5em] placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition"
                    placeholder="••••••"
                    required
                    autoComplete="off"
                    autoFocus
                  />
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-transparent border border-white/20 rounded-full px-5 py-3.5 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition"
                      placeholder="New password (min 6 characters)"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                    >
                      {showNewPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={forgotBusy || resetCode.length !== 6}
                    className="w-full bg-white hover:bg-gray-100 text-slate-900 font-bold py-3.5 rounded-full transition-all shadow-lg disabled:opacity-50"
                  >
                    {forgotBusy ? "Resetting..." : "Reset Password"}
                  </button>
                </form>
              )}

              <button
                onClick={exitForgot}
                className="w-full text-gray-400 hover:text-white text-sm mt-5 transition"
              >
                ← Back to login
              </button>
            </>
          ) : (
          <>
          <h2 className="text-2xl font-bold text-white text-center mb-2">Welcome back</h2>
          <p className="text-gray-400 text-center mb-7 text-sm">
            Access premium chatbot analytics & journey insights.
          </p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          {notice && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm text-center">
              {notice}
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

            <button
              type="button"
              onClick={() => { setForgotStep("request"); setError(""); setNotice(""); }}
              className="w-full text-blue-400 hover:text-blue-300 text-sm pt-1 transition"
            >
              Forgot password?
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            New user?{" "}
            <button
              onClick={() => switchMode("signup")}
              className="text-blue-400 hover:text-blue-300 font-semibold transition"
            >
              Sign up
            </button>
          </p>

          <p className="text-gray-600 text-xs text-center mt-4">
            Secured by OAuth 2.0 · Premium Analytics Dashboard
          </p>
          </>
          )}
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
