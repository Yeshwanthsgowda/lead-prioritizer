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

  // Call brief generation state
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [briefError, setBriefError] = useState(null);

  // Call mode full-screen overlay state
  const [callModeOpen, setCallModeOpen] = useState(false);
  const [showCallModeObjections, setShowCallModeObjections] = useState(false);

  // Chat panel state
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [copiedChatIndex, setCopiedChatIndex] = useState(null);

  // Optimistic pending user message while waiting for AI coach
  const [pendingUserMessage, setPendingUserMessage] = useState(null);

  // Ref tracking if a chat message is actively being sent
  const chatSendingRef = useRef(false);
  const chatScrollRef = useRef(null);

  // Copy feedback
  const [copied, setCopied] = useState(false);
  const [copiedOpening, setCopiedOpening] = useState(false);

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Escape key listener for Call Mode overlay
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && callModeOpen) {
        setCallModeOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [callModeOpen]);

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

      // Only update state if JSON changed to prevent UI re-renders/flickers.
      // If a chat message is currently in-flight, do not overwrite the chat array.
      setLead((prev) => {
        if (!prev) return data;
        let incoming = data;
        if (chatSendingRef.current) {
          incoming = { ...data, chat: prev.chat };
        }
        const prevStr = JSON.stringify(prev);
        const newStr = JSON.stringify(incoming);
        return prevStr === newStr ? prev : incoming;
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

  // Helper to scroll chat container to bottom
  function scrollChatToBottom() {
    requestAnimationFrame(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    });
  }

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

  // Generate / Regenerate Call Brief action
  async function handleGenerateBrief() {
    setGeneratingBrief(true);
    setBriefError(null);
    try {
      const res = await fetch(`/api/leads/${id}/callbrief`, {
        method: "POST",
        headers: { "x-user": currentUser },
      });
      const payload = await res.json();

      if (!res.ok) {
        setBriefError(payload.error || `Error generating brief (${res.status})`);
        return;
      }

      // Update lead state with new call_brief
      setLead(payload);
    } catch (err) {
      setBriefError("Network error generating call brief: " + err.message);
    } finally {
      setGeneratingBrief(false);
    }
  }

  // Send message to AI Sales Coach
  async function handleSendChat(customMessage) {
    const textToSend = typeof customMessage === "string" ? customMessage : chatInput;
    if (!textToSend || !textToSend.trim() || sendingChat) return;

    const trimmed = textToSend.trim();
    setChatError(null);
    setChatInput("");
    setSendingChat(true);
    chatSendingRef.current = true;

    // Optimistic UI: display user message immediately
    const optimisticMessage = {
      role: "user",
      content: trimmed,
      author: currentUser,
      at: new Date().toISOString(),
    };
    setPendingUserMessage(optimisticMessage);
    scrollChatToBottom();

    try {
      const res = await fetch(`/api/leads/${id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user": currentUser,
        },
        body: JSON.stringify({ message: trimmed }),
      });

      const updatedChat = await res.json();

      if (!res.ok) {
        throw new Error(updatedChat.error || `Server error (${res.status})`);
      }

      // Update lead chat state with server-confirmed array
      setLead((prev) => (prev ? { ...prev, chat: updatedChat } : prev));
      setPendingUserMessage(null);
      scrollChatToBottom();
    } catch (err) {
      // Revert optimistic message and restore text to input
      setPendingUserMessage(null);
      setChatInput(trimmed);
      setChatError(`Failed to send message: ${err.message}`);
    } finally {
      setSendingChat(false);
      chatSendingRef.current = false;
    }
  }

  // Clear Chat History
  async function handleClearChat() {
    if (!confirm("Clear the chat history for this lead?")) return;

    try {
      const res = await fetch(`/api/leads/${id}/chat`, {
        method: "DELETE",
        headers: { "x-user": currentUser },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || "Failed to clear chat.");
        return;
      }

      setLead((prev) => (prev ? { ...prev, chat: [] } : prev));
      setPendingUserMessage(null);
      setChatError(null);
    } catch (err) {
      alert("Error clearing chat: " + err.message);
    }
  }

  function handleCopyChatMessage(text, index) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedChatIndex(index);
    setTimeout(() => setCopiedChatIndex(null), 2000);
  }

  function handleCopy(text) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyOpening(text) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedOpening(true);
    setTimeout(() => setCopiedOpening(false), 2000);
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

        {/* 5. Call Brief Section */}
        {lead.call_brief ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">Call Brief</h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Glance at this script while the phone rings
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCallModeOpen(true)}
                  className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <span>⚡</span> Start call mode
                </button>
              </div>
            </div>

            {briefError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-center justify-between">
                <span>{briefError}</span>
                <button
                  onClick={() => setBriefError(null)}
                  className="font-bold text-red-500 hover:text-red-700 ml-4"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Block 1: Call goal */}
            <div>
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Call Goal
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {lead.call_brief.call_goal}
              </p>
            </div>

            {/* Block 2: Opening line */}
            <div>
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Opening line (first 20 seconds)
              </div>
              <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-start justify-between gap-4">
                <p className="text-base sm:text-lg font-medium text-indigo-950 leading-relaxed">
                  "{lead.call_brief.opening_line}"
                </p>
                <button
                  onClick={() => handleCopyOpening(lead.call_brief.opening_line)}
                  className="shrink-0 px-3 py-1.5 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  {copiedOpening ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Block 3: What I already know (recap) */}
            {Array.isArray(lead.call_brief.recap) && lead.call_brief.recap.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  What I already know (Do not re-ask)
                </div>
                <ul className="space-y-1.5">
                  {lead.call_brief.recap.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-indigo-500 font-bold">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Block 4: Questions to ask */}
            {Array.isArray(lead.call_brief.discovery_questions) && (
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Questions to ask
                </div>
                <div className="space-y-3">
                  {lead.call_brief.discovery_questions.map((q, idx) => (
                    <div key={idx} className="bg-gray-50 border border-gray-100 rounded-xl p-3.5">
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {q.question}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Why it matters: {q.why_it_matters}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Block 5: Likely objections */}
            {Array.isArray(lead.call_brief.objections) && lead.call_brief.objections.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Likely objections & replies
                </div>
                <div className="space-y-3">
                  {lead.call_brief.objections.map((item, idx) => (
                    <div key={idx} className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3.5">
                      <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <span>⚠️ If customer says:</span>
                        <span>"{item.objection}"</span>
                      </div>
                      <div className="text-sm font-medium text-gray-900 mt-1 pl-4 border-l-2 border-amber-400">
                        {item.response}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Block 6: Closing ask */}
            {lead.call_brief.closing_ask && (
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Closing ask (Before hanging up)
                </div>
                <p className="text-sm font-semibold text-gray-900 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  {lead.call_brief.closing_ask}
                </p>
              </div>
            )}

            {/* Block 7: Avoid */}
            {Array.isArray(lead.call_brief.avoid) && lead.call_brief.avoid.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span>⛔</span> Things to avoid on this call
                </div>
                <ul className="space-y-1.5">
                  {lead.call_brief.avoid.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs font-medium text-red-800 bg-red-50 p-2 rounded-lg border border-red-100">
                      <span>•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Brief Footer: Generated info + Regenerate */}
            <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
              <span>
                Generated by {lead.call_brief.generated_by || "Salesperson"}
                {lead.call_brief.generated_at
                  ? ` at ${new Date(lead.call_brief.generated_at).toLocaleString()}`
                  : ""}
              </span>

              <button
                onClick={handleGenerateBrief}
                disabled={generatingBrief}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
              >
                {generatingBrief ? "Regenerating brief…" : "↻ Regenerate brief"}
              </button>
            </div>
          </div>
        ) : (
          /* No brief yet state */
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">Call Brief</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Get an opening line, three questions and objection replies for this call.
              </p>
              {briefError && (
                <p className="text-xs text-red-600 mt-2 font-medium">
                  {briefError}
                </p>
              )}
            </div>

            <button
              onClick={handleGenerateBrief}
              disabled={generatingBrief}
              className="shrink-0 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {generatingBrief ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Preparing your brief…
                </>
              ) : briefError ? (
                "Retry generation"
              ) : (
                "Generate call brief"
              )}
            </button>
          </div>
        )}

        {/* 6. Ask AI Sales Coach Chat Panel */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Ask AI about {lead.name ? lead.name.trim().split(/\s+/)[0] : "Lead"}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Answers use this lead's details, analysis and call brief.
              </p>
            </div>

            {Array.isArray(lead.chat) && lead.chat.length > 0 && (
              <button
                onClick={handleClearChat}
                className="text-xs text-gray-400 hover:text-red-600 font-medium transition-colors"
              >
                Clear chat
              </button>
            )}
          </div>

          {/* Messages scroll box */}
          <div
            ref={chatScrollRef}
            className="h-[340px] sm:h-[420px] overflow-y-auto space-y-3.5 pr-1 border border-gray-100 bg-gray-50/60 rounded-xl p-4"
          >
            {(!lead.chat || lead.chat.length === 0) && !pendingUserMessage ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                <span className="text-2xl mb-1.5">💬</span>
                <p className="text-sm font-medium text-gray-600">No messages yet</p>
                <p className="text-xs text-gray-400 max-w-xs mt-1">
                  Ask strategy advice, request script adjustments, or click one of the suggested questions below.
                </p>
              </div>
            ) : (
              <>
                {(lead.chat || []).map((msg, idx) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                    >
                      {isUser && msg.author && (
                        <span className="text-[10px] text-gray-400 mb-0.5 mr-1 font-medium">
                          {msg.author}
                        </span>
                      )}
                      <div
                        className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? "bg-indigo-600 text-white rounded-br-xs"
                            : "bg-white border border-gray-200 text-gray-800 rounded-bl-xs shadow-2xs"
                        }`}
                      >
                        {msg.content}
                      </div>

                      {!isUser && (
                        <button
                          onClick={() => handleCopyChatMessage(msg.content, idx)}
                          className="mt-1 ml-1 text-[11px] text-gray-400 hover:text-indigo-600 font-medium transition-colors flex items-center gap-1"
                        >
                          {copiedChatIndex === idx ? "✓ Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Optimistic pending user message */}
                {pendingUserMessage && (
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-400 mb-0.5 mr-1 font-medium">
                      {pendingUserMessage.author}
                    </span>
                    <div className="max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed whitespace-pre-wrap bg-indigo-600 text-white rounded-br-xs opacity-90">
                      {pendingUserMessage.content}
                    </div>
                  </div>
                )}

                {/* Thinking bubble */}
                {sendingChat && (
                  <div className="flex flex-col items-start">
                    <div className="bg-white border border-gray-200 text-gray-500 rounded-2xl rounded-bl-xs p-3 text-xs flex items-center gap-2 shadow-2xs">
                      <svg className="w-3.5 h-3.5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Thinking…
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Chat error notification */}
          {chatError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-center justify-between">
              <span>{chatError}</span>
              <button
                onClick={() => handleSendChat(chatInput)}
                className="font-bold underline ml-3"
              >
                Retry
              </button>
            </div>
          )}

          {/* Suggested question chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              "What should I emphasize on the call?",
              "Make my reply more assertive",
              `Why is this lead ${tag}?`,
              "What could stop this deal?",
              "Give me a 30-second call script",
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => handleSendChat(chip)}
                disabled={sendingChat}
                className="shrink-0 px-3 py-1 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 border border-gray-200 rounded-full text-xs text-gray-600 transition-colors disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input & Send area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
              disabled={sendingChat}
              rows={2}
              placeholder="Ask anything about this lead (Enter to send, Shift+Enter for newline)…"
              className="flex-1 text-sm text-gray-900 border border-gray-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400 resize-none disabled:opacity-60 bg-white"
            />

            <button
              type="submit"
              disabled={!chatInput.trim() || sendingChat}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-[42px] flex items-center justify-center shrink-0"
            >
              Send
            </button>
          </form>
        </div>

        {/* 7. Two-Column Grid for Cards (Items 7-11) */}
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

      {/* Call Mode Full-screen Overlay */}
      {callModeOpen && lead.call_brief && (
        <div className="fixed inset-0 z-50 bg-gray-950 text-white overflow-y-auto p-4 sm:p-8 flex flex-col justify-between animate-in fade-in duration-200">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div>
                <div className="text-xs uppercase font-bold tracking-wider text-indigo-400">
                  Call Mode
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
                  {lead.name}
                </h1>
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="inline-flex items-center gap-2 text-lg sm:text-xl font-bold text-green-400 hover:text-green-300 font-mono mt-1 underline"
                  >
                    <span>📞</span> Tap to call: {lead.phone}
                  </a>
                )}
              </div>

              <button
                onClick={() => setCallModeOpen(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded-xl border border-gray-700 transition-colors"
              >
                ✕ Close (Esc)
              </button>
            </div>

            {/* Call Goal */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Goal
              </div>
              <p className="text-base sm:text-lg font-bold text-indigo-300">
                {lead.call_brief.call_goal}
              </p>
            </div>

            {/* Opening Line */}
            <div className="bg-indigo-950/70 border border-indigo-700/60 rounded-2xl p-5 sm:p-6 shadow-md">
              <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2">
                Opening Line (First 20s)
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
                "{lead.call_brief.opening_line}"
              </p>
            </div>

            {/* 3 Discovery Questions */}
            {Array.isArray(lead.call_brief.discovery_questions) && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Discovery Questions
                </div>
                <div className="space-y-3">
                  {lead.call_brief.discovery_questions.map((q, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-indigo-900 text-indigo-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-base sm:text-lg font-semibold text-gray-100">
                        {q.question}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Closing Ask */}
            {lead.call_brief.closing_ask && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Closing Ask
                </div>
                <p className="text-base sm:text-lg font-bold text-amber-300">
                  {lead.call_brief.closing_ask}
                </p>
              </div>
            )}

            {/* Toggle Objections */}
            {Array.isArray(lead.call_brief.objections) && lead.call_brief.objections.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowCallModeObjections((prev) => !prev)}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-xs font-semibold rounded-xl text-gray-300 flex items-center gap-2 transition-colors"
                >
                  <span>{showCallModeObjections ? "▼" : "▶"}</span>
                  {showCallModeObjections ? "Hide Objections" : "Show Objections"}
                </button>

                {showCallModeObjections && (
                  <div className="mt-3 space-y-3">
                    {lead.call_brief.objections.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-900/90 border border-amber-900/60 rounded-xl p-4"
                      >
                        <div className="text-xs font-bold text-amber-400 mb-1">
                          ⚠️ "{item.objection}"
                        </div>
                        <div className="text-sm sm:text-base font-medium text-gray-200 pl-3 border-l-2 border-amber-500">
                          {item.response}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
