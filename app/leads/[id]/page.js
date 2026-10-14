"use client";

// app/leads/[id]/page.js — Lead detail view.
//
// WHY "use client": Needs browser localStorage (currentUser), polling interval,
// clipboard copy actions, and interactive claim/release state.

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const POLL_INTERVAL_MS = 4000;

const TAG_STYLES = {
  Hot: "bg-red-100 text-red-700 border border-red-200",
  Warm: "bg-amber-100 text-amber-700 border border-amber-200",
  Cold: "bg-blue-100 text-blue-700 border border-blue-200",
};

const TAG_DOT = {
  Hot: "bg-red-500",
  Warm: "bg-amber-500",
  Cold: "bg-blue-400",
};

const SUB_SCORE_LIMITS = [
  { key: "budget", label: "Budget", max: 25 },
  { key: "timeline", label: "Timeline", max: 30 },
  { key: "requirement", label: "Requirement", max: 20 },
  { key: "engagement", label: "Engagement", max: 25 },
];

/**
 * Format phone number for WhatsApp wa.me link.
 * Strip non-digits; if 10 digits, prepend country code 91.
 */
function formatWhatsAppNumber(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function LeadDetailContent() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Claim/Release states
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Copy feedback
  const [copied, setCopied] = useState(false);

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Read identity from localStorage on client mount
  useEffect(() => {
    const stored = localStorage.getItem("currentUser");
    if (!stored) {
      router.replace("/");
      return;
    }
    setCurrentUser(stored);
    setHydrated(true);
  }, [router]);

  // Lead fetcher supporting initial load and silent polling
  const fetchLead = useCallback(async ({ silent = false } = {}) => {
    const user = currentUserRef.current;
    if (!user || !id) return;

    if (!silent) setLoading(true);

    try {
      const res = await fetch(`/api/leads/${id}`, {
        headers: { "x-user": user },
      });

      if (res.status === 404) {
        setNotFound(true);
        if (!silent) setLead(null);
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      setNotFound(false);
      setFetchError(null);

      // Only update state if JSON changed to prevent UI re-renders/flickers
      setLead((prev) => {
        const prevStr = JSON.stringify(prev);
        const newStr = JSON.stringify(data);
        return prevStr === newStr ? prev : data;
      });
    } catch (err) {
      if (!silent) {
        setFetchError("Could not load lead: " + err.message);
      }
      // On silent poll failure, preserve last good data
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  // Initial fetch when identity is ready
  useEffect(() => {
    if (currentUser && id) {
      fetchLead();
    }
  }, [currentUser, id, fetchLead]);

  // 4-second polling to keep claim status and lead details in sync
  useEffect(() => {
    if (!currentUser || !id) return;

    const intervalId = setInterval(() => {
      if (document.hidden) return; // Skip if tab is inactive
      fetchLead({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [currentUser, id, fetchLead]);

  // Claim action
  async function handleClaim() {
    setActionInProgress(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/leads/${id}/claim`, {
        method: "POST",
        headers: { "x-user": currentUser },
      });
      const payload = await res.json();

      if (res.status === 409) {
        setActionError(`Already claimed by ${payload.claimed_by}`);
        await fetchLead({ silent: true });
        return;
      }

      if (!res.ok) {
        setActionError(payload.error || `Error ${res.status}`);
        return;
      }

      setLead(payload);
    } catch (err) {
      setActionError("Claim failed: " + err.message);
    } finally {
      setActionInProgress(false);
    }
  }

  // Release action
  async function handleRelease() {
    setActionInProgress(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/leads/${id}/release`, {
        method: "POST",
        headers: { "x-user": currentUser },
      });
      const payload = await res.json();

      if (!res.ok) {
        setActionError(payload.error || `Error ${res.status}`);
        return;
      }

      setLead(payload);
    } catch (err) {
      setActionError("Release failed: " + err.message);
    } finally {
      setActionInProgress(false);
    }
  }

  function handleCopy(text) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="w-5 h-5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading lead details…
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
            🔍
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Lead not found</h2>
          <p className="text-sm text-gray-500 mb-6">
            The lead you are looking for does not exist or may have been deleted.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (fetchError && !lead) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Error loading lead</h2>
          <p className="text-sm text-gray-600 mb-6">{fetchError}</p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back
            </Link>
            <button
              onClick={() => fetchLead()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const analysis = lead.analysis || {};
  const subScores = analysis.sub_scores || {};
  const tag = lead.tag || "Cold";
  const score = lead.score ?? 0;

  // Claim logic state
  const isClaimedByMe = lead.claimed_by === currentUser;
  const isClaimedByOther = lead.claimed_by && !isClaimedByMe;
  const isUnclaimed = !lead.claimed_by;

  const formattedClaimedAt = lead.claimed_at
    ? new Date(lead.claimed_at).toLocaleString()
    : null;

  const formattedCreatedAt = lead.created_at
    ? new Date(lead.created_at).toLocaleString()
    : "—";

  // WhatsApp link preparation
  const waNumber = formatWhatsAppNumber(lead.phone);
  const waUrl = waNumber && analysis.suggested_response
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(analysis.suggested_response)}`
    : null;

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Top navigation bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            ← Back to dashboard
          </Link>
          <span className="text-xs text-gray-400">Viewing as {currentUser}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
        {/* Error notification if claim/release has conflict */}
        {actionError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="text-amber-500 hover:text-amber-700 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Claim Banner */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            {isUnclaimed && (
              <>
                <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                  ○
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">This lead is open</h3>
                  <p className="text-xs text-gray-500">Not currently assigned to anyone</p>
                </div>
              </>
            )}

            {isClaimedByMe && (
              <>
                <div className="w-9 h-9 rounded-full bg-green-50 text-green-600 flex items-center justify-center font-bold text-sm">
                  ✓
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">You're working this lead</h3>
                  <p className="text-xs text-gray-500">
                    Claimed {formattedClaimedAt ? `at ${formattedClaimedAt}` : "by you"}
                  </p>
                </div>
              </>
            )}

            {isClaimedByOther && (
              <>
                <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-sm">
                  🔒
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Claimed by {lead.claimed_by}
                  </h3>
                  <p className="text-xs text-gray-500">Currently in progress by another salesperson</p>
                </div>
              </>
            )}
          </div>

          <div>
            {isUnclaimed && (
              <button
                onClick={handleClaim}
                disabled={actionInProgress}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {actionInProgress ? "Claiming…" : "Claim lead"}
              </button>
            )}

            {isClaimedByMe && (
              <button
                onClick={handleRelease}
                disabled={actionInProgress}
                className="px-4 py-2 border border-gray-300 hover:border-red-300 hover:text-red-600 text-gray-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {actionInProgress ? "Releasing…" : "Release lead"}
              </button>
            )}
          </div>
        </div>

        {/* 2. Header Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{lead.name}</h1>
            {analysis.intent && (
              <p className="text-sm text-gray-600 italic">
                "{analysis.intent}"
              </p>
            )}
            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-gray-500">
              {lead.property_requirement && (
                <span className="flex items-center gap-1 font-medium text-gray-700">
                  🏠 {lead.property_requirement}
                </span>
              )}
              {lead.location && (
                <span className="flex items-center gap-1">
                  📍 {lead.location}
                </span>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-1 text-indigo-600 hover:underline font-mono"
                >
                  📞 {lead.phone}
                </a>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1 text-indigo-600 hover:underline"
                >
                  ✉️ {lead.email}
                </a>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center md:flex-col md:items-end gap-3 border-t md:border-t-0 pt-4 md:pt-0 border-gray-100">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${TAG_STYLES[tag] || TAG_STYLES.Cold}`}
            >
              <span className={`w-2 h-2 rounded-full ${TAG_DOT[tag] || TAG_DOT.Cold}`} />
              {tag} Lead
            </span>
            <div className="text-right">
              <span className="text-3xl font-extrabold text-gray-900">{score}</span>
              <span className="text-xs text-gray-400 font-medium">/100</span>
            </div>
          </div>
        </div>

        {/* 3. Why this priority Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-1">
              Why this priority
            </h2>
            <p className="text-sm font-medium text-gray-900">
              {analysis.score_reason || "Score calculated based on lead qualification criteria."}
            </p>
          </div>

          {/* Sub-score progress bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {SUB_SCORE_LIMITS.map(({ key, label, max }) => {
              const val = subScores[key] ?? 0;
              const pct = Math.min(100, Math.round((val / max) * 100));

              return (
                <div key={key} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <span className="text-gray-600">{label}</span>
                    <span className="text-gray-900 font-semibold">{val}/{max}</span>
                  </div>
                  <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct >= 70 ? "bg-indigo-600" : pct >= 40 ? "bg-indigo-400" : "bg-gray-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400 tracking-wide">
            HOT &ge; 70, WARM 40-69, COLD &lt; 40
          </p>
        </div>

        {/* 4. Recommended Next Action */}
        {analysis.next_action && (
          <div
            className={`rounded-2xl p-5 border shadow-xs ${
              tag === "Hot"
                ? "bg-red-50 border-red-200 text-red-900"
                : tag === "Warm"
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-75 mb-1">
              Recommended Next Action
            </div>
            <div className="text-base font-semibold">
              {analysis.next_action}
            </div>
          </div>
        )}

        {/* 5. Two-Column Grid for Cards (Items 7-11) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Item 7: Customer Information */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
            <h2 className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-4">
              Customer Information
            </h2>
            <dl className="divide-y divide-gray-100 text-sm">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Name</dt>
                <dd className="font-medium text-gray-900 text-right">{lead.name}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Phone</dt>
                <dd className="font-medium text-gray-900 text-right">
                  <a href={`tel:${lead.phone}`} className="text-indigo-600 hover:underline">
                    {lead.phone}
                  </a>
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Email</dt>
                <dd className="text-right text-gray-700">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-indigo-600 hover:underline">
                      {lead.email}
                    </a>
                  ) : (
                    <span className="text-gray-400">Not provided</span>
                  )}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Location</dt>
                <dd className="text-right text-gray-900 font-medium">
                  {lead.location || <span className="text-gray-400 font-normal">Not shared</span>}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Property Requirement</dt>
                <dd className="text-right text-gray-900 font-medium">
                  {lead.property_requirement || <span className="text-gray-400 font-normal">Not specified</span>}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Budget</dt>
                <dd className="text-right text-gray-900 font-medium">
                  {lead.budget || <span className="text-gray-400 font-normal">Not shared</span>}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Buying Timeline</dt>
                <dd className="text-right text-gray-900 font-medium">{lead.timeline}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Added at</dt>
                <dd className="text-right text-gray-600">{formattedCreatedAt}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Added by</dt>
                <dd className="text-right text-gray-900 font-medium">{lead.created_by || "—"}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-gray-500">Claimed by</dt>
                <dd className="text-right text-gray-900 font-medium">
                  {lead.claimed_by || <span className="text-gray-400 font-normal">Unclaimed</span>}
                </dd>
              </div>
            </dl>
          </div>

          {/* Item 8: Customer Message */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col">
            <h2 className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-3">
              Customer Message
            </h2>
            <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-sans">
              {lead.message}
            </div>
          </div>

          {/* Item 9: Key Requirements */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
            <h2 className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-3">
              Key Requirements
            </h2>
            {analysis.key_requirements && Object.keys(analysis.key_requirements).length > 0 ? (
              <dl className="divide-y divide-gray-100 text-sm">
                {Object.entries(analysis.key_requirements).map(([k, v]) => (
                  <div key={k} className="py-2 flex justify-between gap-4">
                    <dt className="text-xs font-medium text-gray-500">{k}</dt>
                    <dd className="text-sm font-semibold text-gray-900 text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-gray-400 italic">No key requirements extracted.</p>
            )}
          </div>

          {/* Item 10: What's Missing */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
            <div className="mb-3">
              <h2 className="text-xs font-semibold text-gray-500 tracking-wider uppercase">
                What's Missing
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Details the lead did not provide</p>
            </div>
            {Array.isArray(analysis.missing_info) && analysis.missing_info.length > 0 ? (
              <ul className="space-y-2 text-sm text-gray-700">
                {analysis.missing_info.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-500 shrink-0">?</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 italic">Nothing critical missing</p>
            )}
          </div>

          {/* Item 11: Objections and Concerns */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs lg:col-span-2">
            <h2 className="text-xs font-semibold text-gray-500 tracking-wider uppercase mb-3">
              Objections and Concerns
            </h2>
            {Array.isArray(analysis.objections) && analysis.objections.length > 0 ? (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                {analysis.objections.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-red-500 shrink-0 mt-0.5">⚠️</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 italic">None identified yet</p>
            )}
          </div>
        </div>

        {/* Item 12: Suggested Response */}
        {analysis.suggested_response && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 tracking-wider uppercase">
              Suggested Response
            </h2>
            <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl text-sm text-gray-800 leading-relaxed">
              {analysis.suggested_response}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleCopy(analysis.suggested_response)}
                className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>

              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <span>💬</span> Send on WhatsApp
                </a>
              ) : (
                <button
                  disabled
                  className="px-4 py-2 bg-gray-100 text-gray-400 text-xs font-semibold rounded-xl cursor-not-allowed"
                >
                  Send on WhatsApp (Phone unavailable)
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function LeadDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="w-5 h-5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading lead details…
          </div>
        </div>
      }
    >
      <LeadDetailContent />
    </Suspense>
  );
}
