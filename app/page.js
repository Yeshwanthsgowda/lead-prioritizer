"use client";

// app/page.js — Lead dashboard.
//
// WHY "use client": we read localStorage (for the current user) and manage
// all UI state (leads list, form, modal, loading) here. localStorage is only
// available in the browser, so we read it inside useEffect to avoid a
// hydration mismatch between server-rendered HTML and the client.

import { useState, useEffect } from "react";

const ALLOWED_TIMELINES = [
  "Within 1 month",
  "1-3 months",
  "3-6 months",
  "6+ months",
  "Just exploring",
];

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

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  location: "",
  property_requirement: "",
  budget: "",
  timeline: "Within 1 month",
  message: "",
};

// ─── Sign-in screen ───────────────────────────────────────────────────────────

function SignInScreen({ onSelect }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Lead Prioritizer</h1>
        <p className="text-sm text-gray-500 mb-8">Continue as one of the team members</p>
        <div className="space-y-3">
          <button
            onClick={() => onSelect("Salesperson A")}
            className="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            Continue as Salesperson A
          </button>
          <button
            onClick={() => onSelect("Salesperson B")}
            className="w-full py-3 px-4 bg-white text-gray-700 rounded-xl font-medium border border-gray-300 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            Continue as Salesperson B
          </button>
        </div>
        <p className="mt-6 text-xs text-gray-400">
          Demo identity only — not a security mechanism.
        </p>
      </div>
    </div>
  );
}

// ─── New lead modal form ──────────────────────────────────────────────────────

function NewLeadModal({ onClose, onSubmit, submitting, submitError, formData, setFormData }) {
  function handleChange(e) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={!submitting ? onClose : undefined}
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">New lead</h2>
          {!submitting && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Customer name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="e.g. Ravi Shankar"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Phone (Required) + Email (Optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Phone number <span className="text-red-500">*</span>
              </label>
              <input
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                required
                placeholder="e.g. +91 98765 43210"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Email <span className="text-gray-400 text-[11px]">(optional)</span>
              </label>
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="e.g. ravi@example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Location + Budget side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Target / Preferred Location
              </label>
              <input
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="e.g. Whitefield, Indiranagar"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Budget</label>
              <input
                name="budget"
                value={formData.budget}
                onChange={handleChange}
                placeholder="e.g. ₹80L"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Property requirement */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Property requirement
            </label>
            <input
              name="property_requirement"
              value={formData.property_requirement}
              onChange={handleChange}
              placeholder="e.g. 3BHK flat, ready-to-move"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Timeline */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Timeline <span className="text-red-500">*</span>
            </label>
            <select
              name="timeline"
              value={formData.timeline}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              {ALLOWED_TIMELINES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Message / notes <span className="text-red-500">*</span>
            </label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              required
              rows={4}
              placeholder="Paste the customer's enquiry, chat, or your call notes here…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Error message */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            {!submitting && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Analyzing lead…
                </>
              ) : (
                "Analyze & save"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Lead table row ───────────────────────────────────────────────────────────

function LeadRow({ lead }) {
  const tag = lead.tag || "Cold";
  const score = lead.score ?? 0;
  const analysis = lead.analysis || {};

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Priority */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${TAG_STYLES[tag] || TAG_STYLES.Cold}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${TAG_DOT[tag] || TAG_DOT.Cold}`} />
          {tag}
        </span>
        <div className="mt-1 text-xs text-gray-400">{score}/100</div>
      </td>

      {/* Customer */}
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-gray-900 truncate max-w-[180px]">{lead.name}</div>
        {lead.phone && (
          <div className="text-xs text-gray-600 font-mono mt-0.5 truncate max-w-[180px]">
            📞 {lead.phone}
          </div>
        )}
        {lead.email && (
          <div className="text-xs text-gray-400 truncate max-w-[180px]">
            ✉️ {lead.email}
          </div>
        )}
        {lead.location && (
          <div className="text-xs text-gray-500 truncate max-w-[180px] mt-0.5">
            📍 {lead.location}
          </div>
        )}
        {lead.property_requirement && (
          <div className="text-xs text-gray-400 truncate max-w-[180px]">
            🏠 {lead.property_requirement}
          </div>
        )}
      </td>

      {/* Budget & Timeline */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm text-gray-800">{lead.budget || "—"}</div>
        <div className="text-xs text-gray-500 mt-0.5">{lead.timeline}</div>
      </td>

      {/* AI Summary */}
      <td className="px-4 py-3 max-w-[200px]">
        <p className="text-sm text-gray-700 line-clamp-2">{analysis.summary || "—"}</p>
        {analysis.score_reason && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{analysis.score_reason}</p>
        )}
      </td>

      {/* Next action */}
      <td className="px-4 py-3">
        {analysis.next_action ? (
          <span
            className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium max-w-[180px] truncate ${
              tag === "Hot"
                ? "bg-red-50 text-red-700"
                : tag === "Warm"
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700"
            }`}
            title={analysis.next_action}
          >
            {analysis.next_action}
          </span>
        ) : (
          <span className="text-gray-400 text-sm">—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function HomePage() {
  // currentUser starts null — we read localStorage in useEffect to avoid
  // server/client hydration mismatch (localStorage doesn't exist on the server).
  const [currentUser, setCurrentUser] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Read localStorage once after mount.
  useEffect(() => {
    const stored = localStorage.getItem("currentUser");
    if (stored) setCurrentUser(stored);
    setHydrated(true);
  }, []);

  // Fetch leads whenever a user is present.
  useEffect(() => {
    if (!currentUser) return;
    fetchLeads();
  }, [currentUser]);

  async function fetchLeads() {
    setLeadsLoading(true);
    setLeadsError(null);
    try {
      const res = await fetch("/api/leads", {
        headers: { "x-user": currentUser },
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      setLeadsError("Could not load leads. " + err.message);
    } finally {
      setLeadsLoading(false);
    }
  }

  function handleSelectUser(user) {
    localStorage.setItem("currentUser", user);
    setCurrentUser(user);
  }

  function handleSwitchUser() {
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
    setLeads([]);
  }

  function openModal() {
    setFormData(EMPTY_FORM);
    setSubmitError(null);
    setShowModal(true);
  }

  function closeModal() {
    if (submitting) return; // Don't close while analyzing.
    setShowModal(false);
    setSubmitError(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user": currentUser,
        },
        body: JSON.stringify(formData),
      });

      const payload = await res.json();

      if (!res.ok) {
        // Show the server's error message and keep the form open with data intact.
        setSubmitError(payload.error || `Error ${res.status}`);
        return;
      }

      // Prepend the new lead and close the modal.
      setLeads((prev) => [payload, ...prev].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)));
      setShowModal(false);
    } catch (err) {
      setSubmitError("Could not reach the server. " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Wait for hydration so we know whether a user is stored.
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No user stored — show sign-in.
  if (!currentUser) {
    return <SignInScreen onSelect={handleSelectUser} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900 text-sm">Lead Prioritizer</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{currentUser}</span>
            <button
              onClick={handleSwitchUser}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              Switch user
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Title + action */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Lead dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {leads.length} lead{leads.length !== 1 ? "s" : ""}, sorted by priority
            </p>
          </div>
          <button
            onClick={openModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New lead
          </button>
        </div>

        {/* Lead table or states */}
        {leadsLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading leads…
          </div>
        ) : leadsError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-sm text-red-700">
            {leadsError}
            <button
              onClick={fetchLeads}
              className="block mx-auto mt-3 text-xs font-medium text-red-600 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : leads.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No leads yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "New lead" to add your first one.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">
                      Budget / Timeline
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      AI Summary
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Next action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map((lead) => (
                    <LeadRow key={lead.id} lead={lead} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* New lead modal */}
      {showModal && (
        <NewLeadModal
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
          formData={formData}
          setFormData={setFormData}
        />
      )}
    </div>
  );
}
