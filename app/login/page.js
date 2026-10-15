"use client";

// app/login/page.js — Sign-in page for Leed Lens.
//
// WHY "use client": reads sessionStorage on mount to redirect if already
// logged in, and manages form state (email, password, errors).
//
// Two demo buttons let anyone try the app instantly without signing up.
// Real accounts use email + password.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken, setToken } from "@/lib/client-api";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [demoLoading, setDemoLoading] = useState(null); // "A" | "B" | null

  // If already authenticated, skip straight to the dashboard.
  useEffect(() => {
    const token = getToken();
    if (token) router.replace("/");
  }, [router]);

  // ── Demo login ────────────────────────────────────────────────────────────────

  async function handleDemoLogin(which) {
    setDemoLoading(which);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Demo login failed.");
        return;
      }
      setToken(data.token);
      router.push("/");
    } catch (err) {
      setLoginError("Network error. Please try again.");
    } finally {
      setDemoLoading(null);
    }
  }

  // ── Real account login ────────────────────────────────────────────────────────

  async function handleLogin(e) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed.");
        return;
      }
      setToken(data.token);
      router.push("/");
    } catch (err) {
      setLoginError("Network error. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length >= 1 && !loggingIn;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF5EF] px-4">
      <div className="w-full max-w-sm">
        {/* Logo + title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#CE4D47] rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-[#1F1A17]">Leed Lens</h1>
          <p className="text-sm text-[#6B635B] mt-1">
            AI-ranked leads, so your team calls the right people first.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#EDE5DC] p-6">

          {/* Demo section */}
          <p className="text-xs font-semibold text-[#8C827A] uppercase tracking-wide mb-3">
            Try without an account
          </p>
          <div className="space-y-2">
            <button
              onClick={() => handleDemoLogin("A")}
              disabled={demoLoading !== null || loggingIn}
              className="w-full py-2.5 px-4 bg-white text-[#1F1A17] rounded-xl font-medium border border-[#EDE5DC] hover:bg-[#CE4D47] hover:text-white hover:border-[#CE4D47] active:bg-[#B83E38] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {demoLoading === "A" ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : null}
              Continue as Salesperson A
            </button>
            <button
              onClick={() => handleDemoLogin("B")}
              disabled={demoLoading !== null || loggingIn}
              className="w-full py-2.5 px-4 bg-white text-[#1F1A17] rounded-xl font-medium border border-[#EDE5DC] hover:bg-[#CE4D47] hover:text-white hover:border-[#CE4D47] active:bg-[#B83E38] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {demoLoading === "B" ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : null}
              Continue as Salesperson B
            </button>
          </div>
          <p className="text-[11px] text-[#8C827A] mt-2 text-center">
            Open A and B in two tabs to watch claims sync live.
          </p>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#EDE5DC]" />
            <span className="text-xs text-[#8C827A]">or use your own account</span>
            <div className="flex-1 h-px bg-[#EDE5DC]" />
          </div>

          {/* Real login form */}
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#6B635B] mb-1">Work email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B635B] mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white"
              />
            </div>

            {loginError && (
              <div className="bg-[#FDE8E7] border border-[#F7C6C2] rounded-lg px-3 py-2 text-sm text-[#C53929]">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 px-4 rounded-xl bg-[#CE4D47] text-white text-sm font-medium hover:bg-[#B83E38] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loggingIn ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Logging in…
                </>
              ) : "Log in"}
            </button>
          </form>
        </div>

        {/* Sign up link */}
        <p className="text-center text-sm text-[#6B635B] mt-4">
          New here?{" "}
          <Link href="/signup" className="text-[#CE4D47] font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
