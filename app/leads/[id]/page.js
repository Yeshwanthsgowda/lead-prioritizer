"use client";

// app/leads/[id]/page.js — Lead detail view.
//
// WHY "use client": Needs browser localStorage (currentUser), polling interval,
// clipboard copy actions, and interactive claim/release state.

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, getToken, clearToken } from "@/lib/client-api";

const POLL_INTERVAL_MS = 4000;

const TAG_STYLES = {
  Hot: "bg-[#FDE8E7] text-[#C53929] border border-[#F7C6C2]",
  Warm: "bg-[#FEF3E2] text-[#B45309] border border-[#FDE3B7]",
  Cold: "bg-[#F0ECE7] text-[#5C554E] border border-[#E2DBD3]",
};

const TAG_DOT = {
  Hot: "bg-[#CE4D47]",
  Warm: "bg-[#D97706]",
  Cold: "bg-[#8C827A]",
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

  const [user, setUser] = useState(null); // { id, name, ... } from JWT me endpoint
  const [hydrated, setHydrated] = useState(false);

  // currentUser alias for backward compatibility within this component
  const currentUser = user?.id || null;

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

  // Post-call update state (Slice 6)
  const [postCallNotes, setPostCallNotes] = useState("");
  const [updatingLead, setUpdatingLead] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [updateSuccessResult, setUpdateSuccessResult] = useState(null);
  const [expandedCallLogs, setExpandedCallLogs] = useState({}); // { [index]: boolean }

  // Ref tracking if a chat message is actively being sent
  const chatSendingRef = useRef(false);
  const chatScrollRef = useRef(null);

  // Copy feedback
  const [copied, setCopied] = useState(false);
  const [copiedOpening, setCopiedOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  // Load identity from JWT on mount. If no token, redirect to /login.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    // Verify token and hydrate user state.
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) {
          clearToken();
          router.replace("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setHydrated(true);
        }
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  // Lead fetcher supporting initial load and silent polling
  const fetchLead = useCallback(async ({ silent = false } = {}) => {
    if (!id) return;

    if (!silent) setLoading(true);

    try {
      const res = await apiFetch(`/api/leads/${id}`);


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

  // Initial fetch when identity is ready (hydrated = JWT verified, user loaded)
  useEffect(() => {
    if (hydrated && id) {
      fetchLead();
    }
  }, [hydrated, id, fetchLead]);

  // 4-second polling to keep claim status and lead details in sync
  useEffect(() => {
    if (!hydrated || !id) return;

    const intervalId = setInterval(() => {
      if (document.hidden) return; // Skip if tab is inactive
      fetchLead({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [hydrated, id, fetchLead]);

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
      const res = await apiFetch(`/api/leads/${id}/claim`, {
        method: "POST",
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
      const res = await apiFetch(`/api/leads/${id}/release`, {
        method: "POST",
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

  // Delete lead action
  async function handleDeleteLead() {
    if (!window.confirm("Are you sure you want to delete this lead? This action cannot be undone.")) {
      return;
    }
    setDeleting(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/leads/${id}`, {
        method: "DELETE",
      });
      const payload = await res.json();
      if (!res.ok) {
        setActionError(payload.error || `Failed to delete lead (${res.status})`);
        setDeleting(false);
        return;
      }
      // Redirect back to dashboard upon successful deletion
      router.push("/");
    } catch (err) {
      setActionError("Delete failed: " + err.message);
      setDeleting(false);
    }
  }

  // Generate / Regenerate Call Brief action
  async function handleGenerateBrief() {
    setGeneratingBrief(true);
    setBriefError(null);
    try {
      const res = await apiFetch(`/api/leads/${id}/callbrief`, {
        method: "POST",
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
      author: user?.name || "Me",
      at: new Date().toISOString(),
    };
    setPendingUserMessage(optimisticMessage);
    scrollChatToBottom();

    try {
      const res = await apiFetch(`/api/leads/${id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      const res = await apiFetch(`/api/leads/${id}/chat`, {
        method: "DELETE",
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

  // Handle post-call update and re-scoring (Slice 6)
  async function handleUpdateLead() {
    if (!postCallNotes || postCallNotes.trim().length < 20 || updatingLead) return;

    setUpdatingLead(true);
    setUpdateError(null);

    const notesToSend = postCallNotes.trim();

    try {
      const res = await apiFetch(`/api/leads/${id}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: notesToSend }),
      });

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || `Server error (${res.status})`);
      }

      // Update lead state with the updated lead returned by the server
      setLead(payload);

      // Derive latest call log entry for result card display
      const latestLog = Array.isArray(payload.call_log) && payload.call_log.length > 0
        ? payload.call_log[payload.call_log.length - 1]
        : null;

      if (latestLog) {
        setUpdateSuccessResult({
          score_before: latestLog.score_before,
          score_after: latestLog.score_after,
          tag_before: latestLog.tag_before,
          tag_after: latestLog.tag_after,
          reason: latestLog.reason,
          questions_answered: latestLog.questions_answered || [],
          questions_still_open: latestLog.questions_still_open || [],
        });
      }

      // Clear the textarea only on success
      setPostCallNotes("");
    } catch (err) {
      setUpdateError(`Failed to update lead: ${err.message}`);
    } finally {
      setUpdatingLead(false);
    }
  }

  function toggleCallLogExpansion(index) {
    setExpandedCallLogs((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
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
      <div className="min-h-screen flex items-center justify-center bg-[#FAF5EF]">
        <div className="flex items-center gap-2 text-sm text-[#8C827A]">
          <svg className="w-5 h-5 animate-spin text-[#CE4D47]" fill="none" viewBox="0 0 24 24">
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
      <div className="min-h-screen bg-[#FAF5EF] flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-[#EDE5DC] rounded-2xl p-8 text-center shadow-xs">
          <div className="w-12 h-12 bg-[#FAF5EF] border border-[#EDE5DC] rounded-full flex items-center justify-center mx-auto mb-4 text-[#8C827A]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[#1F1A17] mb-1">Lead not found</h2>
          <p className="text-sm text-[#6B635B] mb-6">
            The lead you are looking for does not exist or may have been deleted.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#CE4D47] text-white rounded-xl text-sm font-medium hover:bg-[#B83E38] transition-colors"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (fetchError && !lead) {
    return (
      <div className="min-h-screen bg-[#FAF5EF] flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-[#F7C6C2] rounded-2xl p-8 text-center shadow-xs">
          <h2 className="text-lg font-semibold text-[#C53929] mb-2">Error loading lead</h2>
          <p className="text-sm text-[#6B635B] mb-6">{fetchError}</p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/"
              className="px-4 py-2 border border-[#EDE5DC] text-[#1F1A17] rounded-xl text-sm font-medium hover:bg-[#FAF5EF] transition-colors"
            >
              Back
            </Link>
            <button
              onClick={() => fetchLead()}
              className="px-4 py-2 bg-[#CE4D47] text-white rounded-xl text-sm font-medium hover:bg-[#B83E38] transition-colors"
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

  // Claim logic state — matches both UUID and legacy name
  const isClaimedByMe = Boolean(
    lead.claimed_by &&
      (lead.claimed_by === currentUser ||
        (user?.name && lead.claimed_by === user.name))
  );
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
    <div className="min-h-screen bg-[#FAF5EF] pb-16">
      {/* Top navigation bar */}
      <header className="bg-white border-b border-[#EDE5DC] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#CE4D47] hover:text-[#B83E38] transition-colors"
          >
            ← Back to dashboard
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8C827A]">Viewing as {user?.name || "..."}</span>
            <button
              onClick={handleDeleteLead}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-[#C53929] hover:text-white bg-[#FDE8E7] hover:bg-[#C53929] border border-[#F7C6C2] rounded-xl transition-colors disabled:opacity-50"
              title="Delete this lead"
            >
              {deleting ? (
                <>Deleting…</>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Lead
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
        {/* Error notification if claim/release has conflict */}
        {actionError && (
          <div className="bg-[#FEF3E2] border border-[#FDE3B7] rounded-xl px-4 py-3 text-sm text-[#B45309] flex items-center justify-between">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="text-[#B45309] hover:text-[#78350F] font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Claim Banner */}
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            {isUnclaimed && (
              <>
                <div className="w-9 h-9 rounded-full bg-[#FAF5EF] border border-[#EDE5DC] text-[#8C827A] flex items-center justify-center font-bold text-sm">
                  ○
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1F1A17]">This lead is open</h3>
                  <p className="text-xs text-[#8C827A]">Not currently assigned to anyone</p>
                </div>
              </>
            )}

            {isClaimedByMe && (
              <>
                <div className="w-9 h-9 rounded-full bg-[#EBF7EE] border border-[#C8E6C9] text-[#2E7D32] flex items-center justify-center font-bold text-sm">
                  ✓
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1F1A17]">You're working this lead</h3>
                  <p className="text-xs text-[#6B635B]">
                    Claimed {formattedClaimedAt ? `at ${formattedClaimedAt}` : "by you"}
                  </p>
                </div>
              </>
            )}

            {isClaimedByOther && (
              <>
                <div className="w-9 h-9 rounded-full bg-[#FEF3E2] border border-[#FDE3B7] text-[#B45309] flex items-center justify-center text-sm">
                  <svg className="w-4 h-4 text-[#B45309]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#1F1A17]">
                    Claimed by {lead.claimed_by_name || lead.claimed_by}
                  </h3>
                  <p className="text-xs text-[#8C827A]">Currently in progress by another salesperson</p>
                </div>
              </>
            )}
          </div>

          <div>
            {isUnclaimed && (
              <button
                onClick={handleClaim}
                disabled={actionInProgress}
                className="px-4 py-2 bg-[#CE4D47] hover:bg-[#B83E38] active:bg-[#A33530] text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {actionInProgress ? "Claiming…" : "Claim lead"}
              </button>
            )}

            {isClaimedByMe && (
              <button
                onClick={handleRelease}
                disabled={actionInProgress}
                className="px-4 py-2 border border-[#EDE5DC] hover:border-[#F7C6C2] hover:text-[#CE4D47] text-[#1F1A17] text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {actionInProgress ? "Releasing…" : "Release lead"}
              </button>
            )}
          </div>
        </div>

        {/* 2. Header Card */}
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-[#1F1A17] tracking-tight">{lead.name}</h1>
            {analysis.intent && (
              <p className="text-sm text-[#6B635B] italic">
                "{analysis.intent}"
              </p>
            )}
            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-[#6B635B]">
              {lead.property_requirement && (
                <span className="flex items-center gap-1 font-medium text-[#1F1A17]">
                  <span className="text-[#8C827A]">Req:</span> {lead.property_requirement}
                </span>
              )}
              {lead.location && (
                <span className="flex items-center gap-1">
                  <span className="text-[#8C827A]">Loc:</span> {lead.location}
                </span>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-1 text-[#CE4D47] hover:underline font-mono"
                >
                  <span className="text-[#8C827A] font-sans">Tel:</span> {lead.phone}
                </a>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1 text-[#CE4D47] hover:underline"
                >
                  <span className="text-[#8C827A]">Email:</span> {lead.email}
                </a>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center md:flex-col md:items-end gap-3 border-t md:border-t-0 pt-4 md:pt-0 border-[#EDE5DC]">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${TAG_STYLES[tag] || TAG_STYLES.Cold}`}
            >
              <span className={`w-2 h-2 rounded-full ${TAG_DOT[tag] || TAG_DOT.Cold}`} />
              {tag} Lead
            </span>
            <div className="text-right">
              <span className="text-3xl font-extrabold text-[#1F1A17]">{score}</span>
              <span className="text-xs text-[#8C827A] font-medium">/100</span>
            </div>
          </div>
        </div>

        {/* 3. Why this priority Card */}
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-[#8C827A] tracking-wider uppercase mb-1">
              Why this priority
            </h2>
            <p className="text-sm font-medium text-[#1F1A17]">
              {analysis.score_reason || "Score calculated based on lead qualification criteria."}
            </p>
          </div>

          {/* Sub-score progress bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {SUB_SCORE_LIMITS.map(({ key, label, max }) => {
              const val = subScores[key] ?? 0;
              const pct = Math.min(100, Math.round((val / max) * 100));

              return (
                <div key={key} className="bg-[#FAF5EF] rounded-xl p-3 border border-[#EDE5DC]">
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <span className="text-[#6B635B]">{label}</span>
                    <span className="text-[#1F1A17] font-semibold">{val}/{max}</span>
                  </div>
                  <div className="w-full bg-[#EDE5DC] h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct >= 70 ? "bg-[#CE4D47]" : pct >= 40 ? "bg-[#D97706]" : "bg-[#8C827A]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-[#8C827A] tracking-wide">
            HOT &ge; 70, WARM 40-69, COLD &lt; 40
          </p>
        </div>

        {/* 4. Recommended Next Action */}
        {analysis.next_action && (
          <div
            className={`rounded-2xl p-5 border shadow-xs ${
              tag === "Hot"
                ? "bg-[#FDE8E7] border-[#F7C6C2] text-[#C53929]"
                : tag === "Warm"
                ? "bg-[#FEF3E2] border-[#FDE3B7] text-[#B45309]"
                : "bg-[#F0ECE7] border-[#E2DBD3] text-[#5C554E]"
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
          <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDE5DC] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#1F1A17]">Call Brief</h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#FBEBE8] text-[#CE4D47] border border-[#F7C6C2]">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-[#6B635B] mt-0.5">
                  Glance at this script while the phone rings
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCallModeOpen(true)}
                  className="px-4 py-2 bg-[#1F1A17] hover:bg-black text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  Start call mode
                </button>
              </div>
            </div>

            {/* Stale brief banner if a call occurred since brief generation */}
            {lead.call_brief.stale && (
              <div className="bg-[#FEF3E2] border border-[#FDE3B7] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#B45309]">
                <div>
                  <div className="font-semibold text-[#B45309]">
                    You've had a call since this brief was written. Regenerate it for fresh questions.
                  </div>
                  {lead.call_brief.stale_reason && (
                    <div className="text-[11px] text-[#D97706] mt-0.5">
                      {lead.call_brief.stale_reason}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleGenerateBrief}
                  disabled={generatingBrief}
                  className="px-3 py-1.5 bg-[#B45309] hover:bg-[#92400E] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {generatingBrief ? "Regenerating…" : "Regenerate brief"}
                </button>
              </div>
            )}

            {briefError && (
              <div className="bg-[#FDE8E7] border border-[#F7C6C2] rounded-xl px-4 py-3 text-xs text-[#C53929] flex items-center justify-between">
                <span>{briefError}</span>
                <button
                  onClick={() => setBriefError(null)}
                  className="font-bold text-[#C53929] hover:text-[#9A2617] ml-4"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Block 1: Call goal */}
            <div>
              <div className="text-[11px] font-semibold text-[#8C827A] uppercase tracking-wider mb-1">
                Call Goal
              </div>
              <p className="text-sm font-semibold text-[#1F1A17]">
                {lead.call_brief.call_goal}
              </p>
            </div>

            {/* Block 2: Opening line */}
            <div>
              <div className="text-[11px] font-semibold text-[#8C827A] uppercase tracking-wider mb-1.5">
                Opening line (first 20 seconds)
              </div>
              <div className="p-4 bg-[#FBEBE8]/70 border border-[#F7C6C2] rounded-xl flex items-start justify-between gap-4">
                <p className="text-base sm:text-lg font-medium text-[#1F1A17] leading-relaxed">
                  "{lead.call_brief.opening_line}"
                </p>
                <button
                  onClick={() => handleCopyOpening(lead.call_brief.opening_line)}
                  className="shrink-0 px-3 py-1.5 bg-white border border-[#EDE5DC] hover:bg-[#FAF5EF] text-[#CE4D47] text-xs font-semibold rounded-lg transition-colors"
                >
                  {copiedOpening ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Block 3: What I already know (recap) */}
            {Array.isArray(lead.call_brief.recap) && lead.call_brief.recap.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[#8C827A] uppercase tracking-wider mb-2">
                  What I already know (Do not re-ask)
                </div>
                <ul className="space-y-1.5">
                  {lead.call_brief.recap.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-[#1F1A17]">
                      <span className="text-[#CE4D47] font-bold">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Block 4: Questions to ask */}
            {Array.isArray(lead.call_brief.discovery_questions) && (
              <div>
                <div className="text-[11px] font-semibold text-[#8C827A] uppercase tracking-wider mb-2">
                  Questions to ask
                </div>
                <div className="space-y-3">
                  {lead.call_brief.discovery_questions.map((q, idx) => (
                    <div key={idx} className="bg-[#FAF5EF] border border-[#EDE5DC] rounded-xl p-3.5">
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-[#FBEBE8] text-[#CE4D47] border border-[#F7C6C2] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-[#1F1A17]">
                            {q.question}
                          </p>
                          <p className="text-xs text-[#6B635B] mt-0.5">
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
                <div className="text-[11px] font-semibold text-[#8C827A] uppercase tracking-wider mb-2">
                  Likely objections & replies
                </div>
                <div className="space-y-3">
                  {lead.call_brief.objections.map((item, idx) => (
                    <div key={idx} className="bg-[#FEF3E2] border border-[#FDE3B7] rounded-xl p-3.5">
                      <div className="text-xs font-bold text-[#B45309] flex items-center gap-1.5">
                        <span>If customer says:</span>
                        <span>"{item.objection}"</span>
                      </div>
                      <div className="text-sm font-medium text-[#1F1A17] mt-1 pl-4 border-l-2 border-[#D97706]">
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
                <div className="text-[11px] font-semibold text-[#8C827A] uppercase tracking-wider mb-1">
                  Closing ask (Before hanging up)
                </div>
                <p className="text-sm font-semibold text-[#1F1A17] bg-[#FAF5EF] p-3 rounded-xl border border-[#EDE5DC]">
                  {lead.call_brief.closing_ask}
                </p>
              </div>
            )}

            {/* Block 7: Avoid */}
            {Array.isArray(lead.call_brief.avoid) && lead.call_brief.avoid.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[#C53929] uppercase tracking-wider mb-2">
                  Things to avoid on this call
                </div>
                <ul className="space-y-1.5">
                  {lead.call_brief.avoid.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs font-medium text-[#C53929] bg-[#FDE8E7] p-2.5 rounded-lg border border-[#F7C6C2]">
                      <span>•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Brief Footer: Generated info + Regenerate */}
            <div className="pt-4 border-t border-[#EDE5DC] flex flex-wrap items-center justify-between gap-3 text-xs text-[#8C827A]">
              <span>
                Generated by {lead.call_brief.generated_by || "Salesperson"}
                {lead.call_brief.generated_at
                  ? ` at ${new Date(lead.call_brief.generated_at).toLocaleString()}`
                  : ""}
              </span>

              <button
                onClick={handleGenerateBrief}
                disabled={generatingBrief}
                className="text-xs font-semibold text-[#CE4D47] hover:text-[#B83E38] disabled:opacity-50 transition-colors"
              >
                {generatingBrief ? "Regenerating brief…" : "↻ Regenerate brief"}
              </button>
            </div>
          </div>
        ) : (
          /* No brief yet state */
          <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[#1F1A17]">Call Brief</h2>
              <p className="text-sm text-[#6B635B] mt-0.5">
                Get an opening line, three questions and objection replies for this call.
              </p>
              {briefError && (
                <p className="text-xs text-[#C53929] mt-2 font-medium">
                  {briefError}
                </p>
              )}
            </div>

            <button
              onClick={handleGenerateBrief}
              disabled={generatingBrief}
              className="shrink-0 px-4 py-2.5 bg-[#CE4D47] hover:bg-[#B83E38] active:bg-[#A33530] text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
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
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDE5DC] pb-3">
            <div>
              <h2 className="text-base font-bold text-[#1F1A17]">
                Ask AI about {lead.name ? lead.name.trim().split(/\s+/)[0] : "Lead"}
              </h2>
              <p className="text-xs text-[#6B635B] mt-0.5">
                Answers use this lead's details, analysis and call brief.
              </p>
            </div>

            {Array.isArray(lead.chat) && lead.chat.length > 0 && (
              <button
                onClick={handleClearChat}
                className="text-xs text-[#8C827A] hover:text-[#CE4D47] font-medium transition-colors"
              >
                Clear chat
              </button>
            )}
          </div>

          {/* Messages scroll box */}
          <div
            ref={chatScrollRef}
            className="h-[340px] sm:h-[420px] overflow-y-auto space-y-3.5 pr-1 border border-[#EDE5DC] bg-[#FAF5EF]/60 rounded-xl p-4"
          >
            {(!lead.chat || lead.chat.length === 0) && !pendingUserMessage ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8C827A]">
                <p className="text-sm font-medium text-[#1F1A17]">No messages yet</p>
                <p className="text-xs text-[#6B635B] max-w-xs mt-1">
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
                        <span className="text-[10px] text-[#8C827A] mb-0.5 mr-1 font-medium">
                          {msg.author}
                        </span>
                      )}
                      <div
                        className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? "bg-[#CE4D47] text-white rounded-br-xs"
                            : "bg-white border border-[#EDE5DC] text-[#1F1A17] rounded-bl-xs shadow-2xs"
                        }`}
                      >
                        {msg.content}
                      </div>

                      {!isUser && (
                        <button
                          onClick={() => handleCopyChatMessage(msg.content, idx)}
                          className="mt-1 ml-1 text-[11px] text-[#8C827A] hover:text-[#CE4D47] font-medium transition-colors flex items-center gap-1"
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
                    <span className="text-[10px] text-[#8C827A] mb-0.5 mr-1 font-medium">
                      {pendingUserMessage.author}
                    </span>
                    <div className="max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed whitespace-pre-wrap bg-[#CE4D47] text-white rounded-br-xs opacity-90">
                      {pendingUserMessage.content}
                    </div>
                  </div>
                )}

                {/* Thinking bubble */}
                {sendingChat && (
                  <div className="flex flex-col items-start">
                    <div className="bg-white border border-[#EDE5DC] text-[#6B635B] rounded-2xl rounded-bl-xs p-3 text-xs flex items-center gap-2 shadow-2xs">
                      <svg className="w-3.5 h-3.5 animate-spin text-[#CE4D47]" fill="none" viewBox="0 0 24 24">
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
            <div className="bg-[#FDE8E7] border border-[#F7C6C2] text-[#C53929] text-xs rounded-xl p-3 flex items-center justify-between">
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
                className="shrink-0 px-3 py-1 bg-[#FAF5EF] hover:bg-[#FBEBE8] hover:border-[#F7C6C2] hover:text-[#CE4D47] border border-[#EDE5DC] rounded-full text-xs text-[#6B635B] transition-colors disabled:opacity-50"
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
              className="flex-1 text-sm text-[#1F1A17] border border-[#EDE5DC] rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent placeholder-[#A0988F] resize-none disabled:opacity-60 bg-white"
            />

            <button
              type="submit"
              disabled={!chatInput.trim() || sendingChat}
              className="px-4 py-2.5 bg-[#CE4D47] hover:bg-[#B83E38] active:bg-[#A33530] text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed h-[42px] flex items-center justify-center shrink-0"
            >
              Send
            </button>
          </form>
        </div>

        {/* 7. Two-Column Grid for Cards (Items 7-11) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Item 7: Customer Information */}
          <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs">
            <h2 className="text-xs font-semibold text-[#8C827A] tracking-wider uppercase mb-4">
              Customer Information
            </h2>
            <dl className="divide-y divide-[#EDE5DC] text-sm">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Name</dt>
                <dd className="font-medium text-[#1F1A17] text-right">{lead.name}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Phone</dt>
                <dd className="font-medium text-[#1F1A17] text-right">
                  <a href={`tel:${lead.phone}`} className="text-[#CE4D47] hover:underline font-mono">
                    {lead.phone}
                  </a>
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Email</dt>
                <dd className="text-right text-[#1F1A17]">
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-[#CE4D47] hover:underline">
                      {lead.email}
                    </a>
                  ) : (
                    <span className="text-[#8C827A]">Not provided</span>
                  )}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Location</dt>
                <dd className="text-right text-[#1F1A17] font-medium">
                  {lead.location || <span className="text-[#8C827A] font-normal">Not shared</span>}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Property Requirement</dt>
                <dd className="text-right text-[#1F1A17] font-medium">
                  {lead.property_requirement || <span className="text-[#8C827A] font-normal">Not specified</span>}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Budget</dt>
                <dd className="text-right text-[#1F1A17] font-medium">
                  {lead.budget || <span className="text-[#8C827A] font-normal">Not shared</span>}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Buying Timeline</dt>
                <dd className="text-right text-[#1F1A17] font-medium">{lead.timeline}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Added at</dt>
                <dd className="text-right text-[#6B635B]">{formattedCreatedAt}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Added by</dt>
                <dd className="text-right text-[#1F1A17] font-medium">{lead.created_by_name || lead.created_by || "—"}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-xs font-medium text-[#6B635B]">Claimed by</dt>
                <dd className="text-right text-[#1F1A17] font-medium">
                  {lead.claimed_by_name || lead.claimed_by || <span className="text-[#8C827A] font-normal">Unclaimed</span>}
                </dd>
              </div>
            </dl>
          </div>

          {/* Item 8: Customer Message */}
          <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs flex flex-col">
            <h2 className="text-xs font-semibold text-[#8C827A] tracking-wider uppercase mb-3">
              Customer Message
            </h2>
            <div className="flex-1 bg-[#FAF5EF] border border-[#EDE5DC] rounded-xl p-4 text-sm text-[#1F1A17] whitespace-pre-wrap leading-relaxed font-sans">
              {lead.message}
            </div>
          </div>

          {/* Item 9: Key Requirements */}
          <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs">
            <h2 className="text-xs font-semibold text-[#8C827A] tracking-wider uppercase mb-3">
              Key Requirements
            </h2>
            {analysis.key_requirements && Object.keys(analysis.key_requirements).length > 0 ? (
              <dl className="divide-y divide-[#EDE5DC] text-sm">
                {Object.entries(analysis.key_requirements).map(([k, v]) => (
                  <div key={k} className="py-2 flex justify-between gap-4">
                    <dt className="text-xs font-medium text-[#6B635B]">{k}</dt>
                    <dd className="text-sm font-semibold text-[#1F1A17] text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-[#8C827A] italic">No key requirements extracted.</p>
            )}
          </div>

          {/* Item 10: What's Missing */}
          <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs">
            <div className="mb-3">
              <h2 className="text-xs font-semibold text-[#8C827A] tracking-wider uppercase">
                What's Missing
              </h2>
              <p className="text-xs text-[#8C827A] mt-0.5">Details the lead did not provide</p>
            </div>
            {Array.isArray(analysis.missing_info) && analysis.missing_info.length > 0 ? (
              <ul className="space-y-2 text-sm text-[#1F1A17]">
                {analysis.missing_info.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[#D97706] shrink-0 font-bold">?</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6B635B] italic">Nothing critical missing</p>
            )}
          </div>

          {/* Item 11: Objections and Concerns */}
          <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs lg:col-span-2">
            <h2 className="text-xs font-semibold text-[#8C827A] tracking-wider uppercase mb-3">
              Objections and Concerns
            </h2>
            {Array.isArray(analysis.objections) && analysis.objections.length > 0 ? (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-[#1F1A17]">
                {analysis.objections.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 bg-[#FAF5EF] p-3 rounded-xl border border-[#EDE5DC]">
                    <span className="text-[#C53929] font-bold shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6B635B] italic">None identified yet</p>
            )}
          </div>
        </div>

        {/* Item 12: Suggested Response */}
        {analysis.suggested_response && (
          <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs space-y-4">
            <h2 className="text-xs font-semibold text-[#8C827A] tracking-wider uppercase">
              Suggested Response
            </h2>
            <div className="p-4 bg-[#FBEBE8]/60 border border-[#F7C6C2] rounded-xl text-sm text-[#1F1A17] leading-relaxed">
              {analysis.suggested_response}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => handleCopy(analysis.suggested_response)}
                className="px-4 py-2 border border-[#EDE5DC] hover:bg-[#FAF5EF] text-[#1F1A17] text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>

              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-[#2E7D32] hover:bg-[#256628] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  Send on WhatsApp
                </a>
              ) : (
                <button
                  disabled
                  className="px-4 py-2 bg-[#FAF5EF] border border-[#EDE5DC] text-[#8C827A] text-xs font-semibold rounded-xl cursor-not-allowed"
                >
                  Send on WhatsApp (Phone unavailable)
                </button>
              )}
            </div>
          </div>
        )}

        {/* 13. After the call: update this lead (Slice 6) */}
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs space-y-5">
          <div className="border-b border-[#EDE5DC] pb-3">
            <h2 className="text-base font-bold text-[#1F1A17]">
              After the call: update this lead
            </h2>
            <p className="text-xs text-[#6B635B] mt-0.5">
              Log conversation notes to re-evaluate buyer criteria, re-calculate the qualification score, and update the pipeline.
            </p>
          </div>

          {/* Form area */}
          <div className="space-y-3">
            <textarea
              value={postCallNotes}
              onChange={(e) => setPostCallNotes(e.target.value)}
              disabled={updatingLead || !isClaimedByMe}
              rows={4}
              placeholder="Paste your call notes or transcript. e.g. Spoke 10 min. Wife likes the park-facing unit. Asked for 5% discount. Visit booked Sunday 11am."
              className="w-full text-sm text-[#1F1A17] border border-[#EDE5DC] rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent placeholder-[#A0988F] resize-none disabled:bg-[#FAF5EF] disabled:cursor-not-allowed bg-white"
            />

            {/* Error banner */}
            {updateError && (
              <div className="bg-[#FDE8E7] border border-[#F7C6C2] rounded-xl px-4 py-3 text-xs text-[#C53929] flex items-center justify-between">
                <span>{updateError}</span>
                <button
                  onClick={handleUpdateLead}
                  className="font-bold underline ml-3"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Action button & character helper */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[#8C827A]">
                {!isClaimedByMe
                  ? "Claim this lead to log a call"
                  : postCallNotes.trim().length < 20
                  ? `${20 - postCallNotes.trim().length} more characters needed`
                  : `${postCallNotes.trim().length} characters`}
              </span>

              <button
                type="button"
                onClick={handleUpdateLead}
                disabled={updatingLead || !isClaimedByMe || postCallNotes.trim().length < 20}
                className="px-4 py-2.5 bg-[#CE4D47] hover:bg-[#B83E38] active:bg-[#A33530] text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {updatingLead ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Re-scoring…
                  </>
                ) : (
                  "Log call and re-score"
                )}
              </button>
            </div>
          </div>

          {/* Success result card */}
          {updateSuccessResult && (
            <div className="bg-[#FAF5EF] border border-[#EDE5DC] rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-[#EDE5DC] pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#CE4D47]">
                  Call Logged &amp; Lead Re-scored
                </span>
                <span className="text-xs font-semibold text-[#1F1A17]">
                  Score: {updateSuccessResult.score_before} → {updateSuccessResult.score_after} (
                  {updateSuccessResult.score_after - updateSuccessResult.score_before >= 0 ? "+" : ""}
                  {updateSuccessResult.score_after - updateSuccessResult.score_before})
                  {updateSuccessResult.tag_before !== updateSuccessResult.tag_after && (
                    <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-[#FBEBE8] text-[#CE4D47] border border-[#F7C6C2]">
                      Moved to {updateSuccessResult.tag_after}
                    </span>
                  )}
                </span>
              </div>

              {updateSuccessResult.reason && (
                <p className="text-xs text-[#1F1A17] font-medium leading-relaxed">
                  {updateSuccessResult.reason}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                {Array.isArray(updateSuccessResult.questions_answered) && updateSuccessResult.questions_answered.length > 0 && (
                  <div className="bg-white border border-[#EDE5DC] rounded-lg p-2.5">
                    <span className="font-semibold text-[#2E7D32] block mb-1">Answered on this call:</span>
                    <ul className="space-y-1 text-[#1F1A17]">
                      {updateSuccessResult.questions_answered.map((ans, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-[#2E7D32]">•</span>
                          <span>{ans}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(updateSuccessResult.questions_still_open) && updateSuccessResult.questions_still_open.length > 0 && (
                  <div className="bg-white border border-[#EDE5DC] rounded-lg p-2.5">
                    <span className="font-semibold text-[#B45309] block mb-1">Still open:</span>
                    <ul className="space-y-1 text-[#1F1A17]">
                      {updateSuccessResult.questions_still_open.map((q, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-[#B45309]">•</span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Call History Timeline */}
          {Array.isArray(lead.call_log) && lead.call_log.length > 0 && (
            <div className="pt-4 border-t border-[#EDE5DC] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8C827A]">
                Call History ({lead.call_log.length})
              </h3>

              <div className="space-y-3">
                {[...lead.call_log].reverse().map((entry, idx) => {
                  const scoreDiff = (entry.score_after ?? 0) - (entry.score_before ?? 0);
                  const isExpanded = Boolean(expandedCallLogs[idx]);
                  const dateStr = entry.at ? new Date(entry.at).toLocaleString() : "Recently";

                  return (
                    <div key={idx} className="bg-[#FAF5EF]/70 border border-[#EDE5DC] rounded-xl p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#1F1A17]">{entry.by || "Salesperson"}</span>
                          <span className="text-[#8C827A]">{dateStr}</span>
                        </div>
                        <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${
                          scoreDiff > 0
                            ? "bg-[#EBF7EE] text-[#2E7D32] border border-[#C8E6C9]"
                            : scoreDiff < 0
                            ? "bg-[#FDE8E7] text-[#C53929] border border-[#F7C6C2]"
                            : "bg-white text-[#6B635B] border border-[#EDE5DC]"
                        }`}>
                          Score: {entry.score_before} → {entry.score_after} ({scoreDiff >= 0 ? "+" : ""}{scoreDiff})
                        </span>
                      </div>

                      {entry.summary && (
                        <p className="text-xs text-[#1F1A17] font-medium leading-relaxed">
                          {entry.summary}
                        </p>
                      )}

                      {entry.reason && (
                        <p className="text-[11px] text-[#6B635B] italic">
                          Why: {entry.reason}
                        </p>
                      )}

                      {/* Expandable full notes */}
                      {entry.notes && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleCallLogExpansion(idx)}
                            className="text-[11px] text-[#CE4D47] hover:underline font-medium"
                          >
                            {isExpanded ? "Hide raw notes" : "View raw notes"}
                          </button>
                          {isExpanded && (
                            <div className="mt-1.5 p-2.5 bg-white border border-[#EDE5DC] rounded-lg text-xs text-[#1F1A17] whitespace-pre-wrap font-sans">
                              {entry.notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Call Mode Full-screen Overlay */}
      {callModeOpen && lead.call_brief && (
        <div className="fixed inset-0 z-50 bg-[#141210] text-white overflow-y-auto p-4 sm:p-8 flex flex-col justify-between animate-in fade-in duration-200">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-[#2C2723] pb-4">
              <div>
                <div className="text-xs uppercase font-bold tracking-wider text-[#E06D67]">
                  Call Mode
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
                  {lead.name}
                </h1>
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="inline-flex items-center gap-2 text-lg sm:text-xl font-bold text-[#81C784] hover:text-[#A5D6A7] font-mono mt-1 underline"
                  >
                    Tap to call: {lead.phone}
                  </a>
                )}
              </div>

              <button
                onClick={() => setCallModeOpen(false)}
                className="px-4 py-2 bg-[#221E1B] hover:bg-[#2F2925] text-[#EDE5DC] text-xs font-semibold rounded-xl border border-[#3A332E] transition-colors"
              >
                ✕ Close (Esc)
              </button>
            </div>

            {/* Call Goal */}
            <div className="bg-[#1C1815] border border-[#2C2723] rounded-2xl p-4">
              <div className="text-xs font-bold text-[#8C827A] uppercase tracking-wider mb-1">
                Goal
              </div>
              <p className="text-base sm:text-lg font-bold text-[#F7C6C2]">
                {lead.call_brief.call_goal}
              </p>
            </div>

            {/* Opening Line */}
            <div className="bg-[#2A1D1C] border border-[#CE4D47]/40 rounded-2xl p-5 sm:p-6 shadow-md">
              <div className="text-xs font-bold text-[#F7C6C2] uppercase tracking-wider mb-2">
                Opening Line (First 20s)
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
                "{lead.call_brief.opening_line}"
              </p>
            </div>

            {/* 3 Discovery Questions */}
            {Array.isArray(lead.call_brief.discovery_questions) && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-[#8C827A] uppercase tracking-wider">
                  Discovery Questions
                </div>
                <div className="space-y-3">
                  {lead.call_brief.discovery_questions.map((q, idx) => (
                    <div
                      key={idx}
                      className="bg-[#1C1815] border border-[#2C2723] rounded-xl p-4 flex items-start gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-[#CE4D47]/20 text-[#F7C6C2] border border-[#CE4D47]/40 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-base sm:text-lg font-semibold text-[#EDE5DC]">
                        {q.question}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Closing Ask */}
            {lead.call_brief.closing_ask && (
              <div className="bg-[#1C1815] border border-[#2C2723] rounded-2xl p-4">
                <div className="text-xs font-bold text-[#8C827A] uppercase tracking-wider mb-1">
                  Closing Ask
                </div>
                <p className="text-base sm:text-lg font-bold text-[#FDE3B7]">
                  {lead.call_brief.closing_ask}
                </p>
              </div>
            )}

            {/* Toggle Objections */}
            {Array.isArray(lead.call_brief.objections) && lead.call_brief.objections.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowCallModeObjections((prev) => !prev)}
                  className="px-4 py-2 bg-[#1C1815] hover:bg-[#28221E] border border-[#2C2723] text-xs font-semibold rounded-xl text-[#EDE5DC] flex items-center gap-2 transition-colors"
                >
                  <span>{showCallModeObjections ? "▼" : "▶"}</span>
                  {showCallModeObjections ? "Hide Objections" : "Show Objections"}
                </button>

                {showCallModeObjections && (
                  <div className="mt-3 space-y-3">
                    {lead.call_brief.objections.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-[#241D17] border border-[#D97706]/30 rounded-xl p-4"
                      >
                        <div className="text-xs font-bold text-[#FDE3B7] mb-1">
                          "{item.objection}"
                        </div>
                        <div className="text-sm sm:text-base font-medium text-[#EDE5DC] pl-3 border-l-2 border-[#D97706]">
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
        <div className="min-h-screen flex items-center justify-center bg-[#FAF5EF]">
          <div className="flex items-center gap-2 text-sm text-[#8C827A]">
            <svg className="w-5 h-5 animate-spin text-[#CE4D47]" fill="none" viewBox="0 0 24 24">
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
