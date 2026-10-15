"use client";

// app/signup/page.js — Create a new account or join an existing team.
//
// WHY "use client": reads URL search params (?invite=CODE) on mount
// and manages form state.
//
// mode "create": user creates a new team and becomes its owner.
// mode "join": user enters an invite code to join an existing team.

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getToken, setToken } from "@/lib/client-api";
import { Suspense } from "react";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState("create"); // "create" | "join"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // If a token already exists, skip to dashboard.
  useEffect(() => {
    const token = getToken();
    if (token) router.replace("/");
  }, [router]);

  // Pre-fill invite code from URL: /signup?invite=XXXX-XXXX
  useEffect(() => {
    const code = searchParams.get("invite");
    if (code) {
      setMode("join");
      setInviteCode(code.toUpperCase());
    }
  }, [searchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      email: email.trim(),
      password,
      mode,
      ...(mode === "create" ? { teamName: teamName.trim() } : { inviteCode: inviteCode.trim() }),
    };

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign-up failed. Please try again.");
        return;
      }
      setToken(data.token);

      // If creating a new team, store a flag so the dashboard can show
      // the one-time invite banner for this team.
      if (mode === "create" && data.team?.id) {
        try {
          localStorage.setItem(`lp_new_team_${data.team.id}`, "1");
        } catch {}
      }

      router.push("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    name.trim().length >= 1 &&
    email.trim().length >= 1 &&
    password.length >= 8 &&
    (mode === "create" ? teamName.trim().length >= 2 : inviteCode.trim().length >= 6) &&
    !submitting;

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
          <h1 className="text-2xl font-semibold text-[#1F1A17]">Create your account</h1>
          <p className="text-sm text-[#6B635B] mt-1">Start a new team or join an existing one.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#EDE5DC] p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Personal details */}
            <div>
              <label className="block text-xs font-medium text-[#6B635B] mb-1">Your name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ravi Sharma"
                autoComplete="name"
                className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white"
              />
            </div>
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
                autoComplete="new-password"
                className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white"
              />
              <p className="text-[11px] text-[#8C827A] mt-1">At least 8 characters.</p>
            </div>

            {/* Team section */}
            <div>
              <p className="text-xs font-medium text-[#6B635B] mb-2">Your team</p>

              {/* Mode toggle */}
              <div className="flex rounded-lg border border-[#EDE5DC] overflow-hidden mb-3">
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    mode === "create"
                      ? "bg-[#CE4D47] text-white"
                      : "bg-white text-[#6B635B] hover:bg-[#FAF5EF]"
                  }`}
                >
                  Start a new team
                </button>
                <button
                  type="button"
                  onClick={() => setMode("join")}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    mode === "join"
                      ? "bg-[#CE4D47] text-white"
                      : "bg-white text-[#6B635B] hover:bg-[#FAF5EF]"
                  }`}
                >
                  Join a team
                </button>
              </div>

              {mode === "create" ? (
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Team name (e.g. Prestige Realty)"
                  className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white"
                />
              ) : (
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="Invite code (e.g. ABCD-1234)"
                  className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white font-mono tracking-wider"
                />
              )}
            </div>

            {error && (
              <div className="bg-[#FDE8E7] border border-[#F7C6C2] rounded-lg px-3 py-2 text-sm text-[#C53929]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 px-4 rounded-xl bg-[#CE4D47] text-white text-sm font-medium hover:bg-[#B83E38] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating account…
                </>
              ) : "Create account"}
            </button>
          </form>
        </div>

        {/* Log in link */}
        <p className="text-center text-sm text-[#6B635B] mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-[#CE4D47] font-medium hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FAF5EF]">
        <div className="w-6 h-6 border-2 border-[#CE4D47] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
