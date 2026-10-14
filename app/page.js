"use client";

// app/page.js — Lead dashboard with polling, tabs, filters, search, sort,
// insights, claim/release, and navigation.
//
// WHY "use client": localStorage (current user), all interactive state
// (tabs, filters, search, sort, modal, claim/release) and polling live here.
// Reading localStorage in useEffect avoids a server/client hydration mismatch.

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TIMELINE_ORDER } from "@/lib/constants";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_USERS = ["Salesperson A", "Salesperson B"];
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

// ─── Sorting ──────────────────────────────────────────────────────────────────

function applySort(leads, sort) {
  const copy = [...leads];
  if (sort === "score") {
    return copy.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
  if (sort === "newest") {
    return copy.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
  }
  if (sort === "timeline") {
    return copy.sort((a, b) => {
      const ai = TIMELINE_ORDER.indexOf(a.timeline);
      const bi = TIMELINE_ORDER.indexOf(b.timeline);
      if (ai !== bi) return ai - bi;
      return (b.score ?? 0) - (a.score ?? 0); // tie-break by score
    });
  }
  return copy;
}

// ─── Sign-in screen ───────────────────────────────────────────────────────────

function SignInScreen({ onSelect }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF5EF] px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-[#EDE5DC] p-8 text-center">
        <div className="w-12 h-12 bg-[#CE4D47] rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[#1F1A17] mb-1">Leed Lens</h1>
        <p className="text-sm text-[#6B635B] mb-8">Continue as one of the team members</p>
        <div className="space-y-3">
          <button onClick={() => onSelect("Salesperson A")}
            className="w-full py-3 px-4 bg-white text-[#1F1A17] rounded-xl font-medium border border-[#EDE5DC] hover:bg-[#CE4D47] hover:text-white hover:border-[#CE4D47] active:bg-[#B83E38] transition-all duration-200">
            Continue as Salesperson A
          </button>
          <button onClick={() => onSelect("Salesperson B")}
            className="w-full py-3 px-4 bg-white text-[#1F1A17] rounded-xl font-medium border border-[#EDE5DC] hover:bg-[#CE4D47] hover:text-white hover:border-[#CE4D47] active:bg-[#B83E38] transition-all duration-200">
            Continue as Salesperson B
          </button>
        </div>
        <p className="mt-6 text-xs text-[#8C827A]">Demo identity only — not a security mechanism.</p>
      </div>
    </div>
  );
}

// ─── New lead modal ───────────────────────────────────────────────────────────

function NewLeadModal({ onClose, onSubmit, submitting, submitError, formData, setFormData }) {
  function handleChange(e) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!submitting ? onClose : undefined} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-y-auto max-h-[90vh] border border-[#EDE5DC]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDE5DC]">
          <h2 className="text-base font-semibold text-[#1F1A17]">New lead</h2>
          {!submitting && (
            <button onClick={onClose} className="text-[#8C827A] hover:text-[#1F1A17] transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[#6B635B] mb-1">
              Customer name <span className="text-[#CE4D47]">*</span>
            </label>
            <input name="name" value={formData.name} onChange={handleChange} required
              placeholder="e.g. Ravi Shankar"
              className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white" />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B635B] mb-1">
                Phone number <span className="text-[#CE4D47]">*</span>
              </label>
              <input name="phone" type="tel" value={formData.phone} onChange={handleChange} required
                placeholder="e.g. +91 98765 43210"
                className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B635B] mb-1">
                Email <span className="text-[#8C827A] text-[11px]">(optional)</span>
              </label>
              <input name="email" type="email" value={formData.email} onChange={handleChange}
                placeholder="e.g. ravi@example.com"
                className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white" />
            </div>
          </div>

          {/* Location + Budget */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B635B] mb-1">Target / Preferred Location</label>
              <input name="location" value={formData.location} onChange={handleChange}
                placeholder="e.g. Whitefield, Indiranagar"
                className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B635B] mb-1">Budget</label>
              <input name="budget" value={formData.budget} onChange={handleChange}
                placeholder="e.g. ₹80L"
                className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white" />
            </div>
          </div>

          {/* Property requirement */}
          <div>
            <label className="block text-xs font-medium text-[#6B635B] mb-1">Property requirement</label>
            <input name="property_requirement" value={formData.property_requirement} onChange={handleChange}
              placeholder="e.g. 3BHK flat, ready-to-move"
              className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white" />
          </div>

          {/* Timeline */}
          <div>
            <label className="block text-xs font-medium text-[#6B635B] mb-1">
              Timeline <span className="text-[#CE4D47]">*</span>
            </label>
            <select name="timeline" value={formData.timeline} onChange={handleChange} required
              className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent bg-white">
              {TIMELINE_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-[#6B635B] mb-1">
              Message / notes <span className="text-[#CE4D47]">*</span>
            </label>
            <textarea name="message" value={formData.message} onChange={handleChange} required rows={4}
              placeholder="Paste the customer's enquiry, chat, or your call notes here…"
              className="w-full border border-[#EDE5DC] rounded-lg px-3 py-2 text-sm text-[#1F1A17] placeholder-[#A0988F] focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent resize-none bg-white" />
          </div>

          {submitError && (
            <div className="bg-[#FDE8E7] border border-[#F7C6C2] rounded-lg px-4 py-3 text-sm text-[#C53929]">
              {submitError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            {!submitting && (
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[#EDE5DC] text-sm font-medium text-[#1F1A17] hover:bg-[#FAF5EF] transition-colors">
                Cancel
              </button>
            )}
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#CE4D47] text-white text-sm font-medium hover:bg-[#B83E38] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Analyzing lead…
                </>
              ) : "Analyze & save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Lead Stats Component (Analytics Views) ───────────────────────────────────

function LeadStatsView({ leads, currentUser, onSelectLead }) {
  // Chart 1: Priority Matrix (Scatter plot: Intent/Engagement X vs Budget/Fit Y)
  // X-axis: Engagement (0-25) + Timeline (0-30) scaled to 0-100
  // Y-axis: Budget (0-25) + Requirement (0-20) scaled to 0-100
  const matrixPoints = leads.map((lead) => {
    const sub = lead.analysis?.sub_scores || {};
    const xRaw = (sub.engagement ?? 0) + (sub.timeline ?? 0); // max 55
    const yRaw = (sub.budget ?? 0) + (sub.requirement ?? 0); // max 45

    const x = Math.min(95, Math.max(5, Math.round((xRaw / 55) * 100)));
    const y = Math.min(95, Math.max(5, Math.round((yRaw / 45) * 100)));

    return {
      id: lead.id,
      name: lead.name,
      tag: lead.tag || "Cold",
      score: lead.score ?? 0,
      requirement: lead.property_requirement || lead.location || "Requirement not specified",
      x,
      y,
      isTopRight: x >= 50 && y >= 50,
    };
  });

  const topRightCount = matrixPoints.filter((p) => p.isTopRight).length;

  // Chart 2: Immediate Urgency Tracker (Speed-to-lead aging)
  // Under 2 Hours (Green), 2-24 Hours (Yellow), Over 24 Hours (Red)
  const now = Date.now();
  let under2h = 0;
  let between2and24h = 0;
  let over24h = 0;

  leads.forEach((l) => {
    const ageMs = now - new Date(l.created_at).getTime();
    const hours = ageMs / (1000 * 60 * 60);
    if (hours <= 2) under2h++;
    else if (hours <= 24) between2and24h++;
    else over24h++;
  });

  const totalAgeCount = leads.length || 1;
  const under2hPct = Math.round((under2h / totalAgeCount) * 100);
  const betweenPct = Math.round((between2and24h / totalAgeCount) * 100);
  const over24hPct = Math.max(0, 100 - under2hPct - betweenPct);

  // Chart 3: Lead Preferences & Inventory Match (Assigned to agent or team)
  const prefCounts = {
    "3-BHK": 0,
    "2-BHK": 0,
    "Villa / Plot": 0,
    "Ready-to-move": 0,
    "Under Construction": 0,
    "Other / Exploring": 0,
  };

  leads.forEach((l) => {
    const text = `${l.property_requirement || ""} ${l.message || ""}`.toLowerCase();
    if (text.includes("3bhk") || text.includes("3-bhk") || text.includes("3 bhk")) {
      prefCounts["3-BHK"]++;
    } else if (text.includes("2bhk") || text.includes("2-bhk") || text.includes("2 bhk")) {
      prefCounts["2-BHK"]++;
    } else if (text.includes("villa") || text.includes("plot") || text.includes("land")) {
      prefCounts["Villa / Plot"]++;
    } else {
      prefCounts["Other / Exploring"]++;
    }

    if (text.includes("ready") || text.includes("immediate")) {
      prefCounts["Ready-to-move"]++;
    } else if (text.includes("under-construction") || text.includes("construction") || text.includes("launch")) {
      prefCounts["Under Construction"]++;
    }
  });

  const maxPrefCount = Math.max(...Object.values(prefCounts), 1);

  // Chart 4: Cadence & Pipeline Health Funnel
  // Stage 1: Inbound Leads (Total leads)
  // Stage 2: Claimed & Assigned (claimed_by is set)
  // Stage 3: Call Brief Prepared (call_brief is generated)
  // Stage 4: Call Logged (at least one call_log entry recorded)
  const funnelStages = [
    { label: "New Inbound Leads", count: leads.length, color: "bg-[#CE4D47]", desc: "Total incoming inquiries" },
    { label: "Claimed & Owned", count: leads.filter((l) => Boolean(l.claimed_by)).length, color: "bg-[#D97706]", desc: "Assigned to a sales rep" },
    { label: "Brief Prepared", count: leads.filter((l) => Boolean(l.call_brief)).length, color: "bg-[#8C827A]", desc: "Call script generated" },
    { label: "Call logged", count: leads.filter((l) => Array.isArray(l.call_log) && l.call_log.length > 0).length, color: "bg-[#2E7D32]", desc: "Completed sales calls recorded" },
  ];

  return (
    <div className="space-y-6">
      {/* 2x2 Grid of visual cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Widget 1: The Priority Matrix */}
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-bold text-[#1F1A17]">
                1. Priority Matrix (Where to Focus First)
              </h2>
              <span className="text-[11px] font-semibold bg-[#FDE8E7] text-[#C53929] border border-[#F7C6C2] px-2 py-0.5 rounded-full">
                {topRightCount} Top Priority
              </span>
            </div>
            <p className="text-xs text-[#6B635B] mb-4">
              Click any dot in the <strong>Top-Right Quadrant</strong> (High Intent + High Budget) to open the lead immediately.
            </p>
          </div>

          {/* Scatter Plot Grid */}
          <div className="relative w-full aspect-square max-h-[340px] bg-[#FAF5EF] border border-[#EDE5DC] rounded-xl overflow-hidden p-2 select-none">
            {/* Quadrant Divider Lines */}
            <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-[#DCD3C7] pointer-events-none" />
            <div className="absolute inset-y-0 left-1/2 border-r border-dashed border-[#DCD3C7] pointer-events-none" />

            {/* Quadrant Labels */}
            <div className="absolute top-2 right-2 text-[10px] font-bold text-[#C53929] bg-[#FDE8E7]/90 border border-[#F7C6C2] px-2 py-0.5 rounded pointer-events-none">
              High Fit &amp; Urgency (Focus Here)
            </div>
            <div className="absolute top-2 left-2 text-[10px] font-medium text-[#B45309] bg-[#FEF3E2]/90 border border-[#FDE3B7] px-1.5 py-0.5 rounded pointer-events-none">
              High Fit, Low Urgency
            </div>
            <div className="absolute bottom-2 right-2 text-[10px] font-medium text-[#5C554E] bg-[#F0ECE7]/90 border border-[#E2DBD3] px-1.5 py-0.5 rounded pointer-events-none">
              Low Fit, High Urgency
            </div>
            <div className="absolute bottom-2 left-2 text-[10px] font-medium text-[#8C827A] bg-[#EDE5DC]/80 px-1.5 py-0.5 rounded pointer-events-none">
              Low Priority
            </div>

            {/* Interactive Dots */}
            {matrixPoints.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#8C827A]">
                No leads available to plot
              </div>
            ) : (
              matrixPoints.map((pt) => {
                const dotColor =
                  pt.tag === "Hot"
                    ? "bg-[#CE4D47] ring-[#F7C6C2]"
                    : pt.tag === "Warm"
                    ? "bg-[#D97706] ring-[#FDE3B7]"
                    : "bg-[#8C827A] ring-[#E2DBD3]";

                return (
                  <button
                    key={pt.id}
                    onClick={() => onSelectLead(pt.id)}
                    style={{ left: `${pt.x}%`, bottom: `${pt.y}%` }}
                    className={`absolute -translate-x-1/2 translate-y-1/2 w-4 h-4 rounded-full ${dotColor} ring-4 hover:scale-125 transition-transform cursor-pointer shadow-xs z-10 group`}
                    title={`${pt.name} (${pt.tag} - ${pt.score}/100)`}
                  >
                    {/* Tooltip on hover */}
                    <div className="hidden group-hover:block absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#1F1A17] text-white text-[11px] py-1 px-2.5 rounded-lg shadow-lg z-30 pointer-events-none">
                      <div className="font-bold">{pt.name} · {pt.score}/100</div>
                      <div className="text-[10px] text-[#DCD3C7] truncate max-w-[140px]">{pt.requirement}</div>
                    </div>
                  </button>
                );
              })
            )}

            {/* Axis labels */}
            <div className="absolute bottom-1 right-1/2 translate-x-1/2 text-[9px] uppercase tracking-wider text-[#8C827A] font-semibold pointer-events-none">
              Intent &amp; Urgency →
            </div>
            <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] uppercase tracking-wider text-[#8C827A] font-semibold origin-center pointer-events-none">
              Budget &amp; Fit →
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-[#6B635B]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#CE4D47]" />Hot Leads</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#D97706]" />Warm Leads</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#8C827A]" />Cold Leads</span>
          </div>
        </div>

        {/* Widget 2: Immediate Urgency Tracker (Speed-to-Lead) */}
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-bold text-[#1F1A17]">
                2. Immediate Urgency Tracker
              </h2>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  over24h === 0
                    ? "bg-[#EBF7EE] text-[#2E7D32] border border-[#C8E6C9]"
                    : "bg-[#FDE8E7] text-[#C53929] border border-[#F7C6C2]"
                }`}
              >
                {over24h === 0 ? "0 Critical" : `${over24h} Overdue`}
              </span>
            </div>
            <p className="text-xs text-[#6B635B] mb-5">
              Goal: Keep the <strong>Critical (Over 24h)</strong> band at zero. Contact prospects while their intent is freshest.
            </p>
          </div>

          {/* Stacked Visual Bar + Donut Metric representation */}
          <div className="space-y-4">
            {/* Visual stacked percentage bar */}
            <div className="w-full h-5 rounded-full overflow-hidden flex bg-[#EDE5DC] shadow-inner">
              <div
                style={{ width: `${under2hPct}%` }}
                className="bg-[#2E7D32] hover:opacity-90 transition-all duration-300"
                title={`Fresh (< 2 hrs): ${under2h}`}
              />
              <div
                style={{ width: `${betweenPct}%` }}
                className="bg-[#D97706] hover:opacity-90 transition-all duration-300"
                title={`Pending (2 - 24 hrs): ${between2and24h}`}
              />
              <div
                style={{ width: `${over24hPct}%` }}
                className="bg-[#CE4D47] hover:opacity-90 transition-all duration-300"
                title={`Critical (> 24 hrs): ${over24h}`}
              />
            </div>

            {/* Three Time-Band Metric Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#EBF7EE] border border-[#C8E6C9] rounded-xl p-3.5 text-center">
                <div className="text-[11px] font-semibold text-[#2E7D32] uppercase tracking-wider">
                  &lt; 2 Hours
                </div>
                <div className="text-2xl font-black text-[#2E7D32] mt-1">{under2h}</div>
                <div className="text-[10px] text-[#2E7D32] mt-0.5 font-medium">{under2hPct}% share</div>
              </div>

              <div className="bg-[#FEF3E2] border border-[#FDE3B7] rounded-xl p-3.5 text-center">
                <div className="text-[11px] font-semibold text-[#B45309] uppercase tracking-wider">
                  2 – 24 Hours
                </div>
                <div className="text-2xl font-black text-[#B45309] mt-1">{between2and24h}</div>
                <div className="text-[10px] text-[#B45309] mt-0.5 font-medium">{betweenPct}% share</div>
              </div>

              <div className="bg-[#FDE8E7] border border-[#F7C6C2] rounded-xl p-3.5 text-center">
                <div className="text-[11px] font-semibold text-[#C53929] uppercase tracking-wider">
                  &gt; 24 Hours
                </div>
                <div className="text-2xl font-black text-[#C53929] mt-1">{over24h}</div>
                <div className="text-[10px] text-[#C53929] mt-0.5 font-medium">{over24hPct}% critical</div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-[#FAF5EF] rounded-xl text-xs text-[#6B635B] border border-[#EDE5DC]">
            <strong>Speed-to-Lead rule:</strong> Inbound buyers contacted within 15 minutes convert at 3x higher rates.
          </div>
        </div>

        {/* Widget 3: Lead Preferences & Inventory Match */}
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-bold text-[#1F1A17]">
                3. Lead Preferences &amp; Inventory Match
              </h2>
              <span className="text-xs text-[#8C827A] font-medium">Inquiry Distribution</span>
            </div>
            <p className="text-xs text-[#6B635B] mb-4">
              Identify inventory shortages early. If 3-BHK inquiry volume is high, cross-sell available 2.5-BHK or 4-BHK units.
            </p>
          </div>

          {/* Horizontal Bar Chart */}
          <div className="space-y-3 my-auto">
            {Object.entries(prefCounts).map(([label, count]) => {
              const pct = Math.round((count / maxPrefCount) * 100);
              return (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-[#1F1A17]">{label}</span>
                    <span className="text-[#6B635B]">{count} leads</span>
                  </div>
                  <div className="w-full bg-[#FAF5EF] border border-[#EDE5DC] h-2.5 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full rounded-full transition-all duration-300 ${
                        label.includes("3-BHK")
                          ? "bg-[#CE4D47]"
                          : label.includes("2-BHK")
                          ? "bg-[#D97706]"
                          : label.includes("Villa")
                          ? "bg-[#8C827A]"
                          : "bg-[#2E7D32]"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-[#EDE5DC] text-[11px] text-[#6B635B] flex justify-between">
            <span>Primary Demand: 3-BHK &amp; 2-BHK Apartments</span>
            <span className="font-semibold text-[#CE4D47]">Inventory Sync Active</span>
          </div>
        </div>

        {/* Widget 4: Cadence & Pipeline Health Funnel */}
        <div className="bg-white border border-[#EDE5DC] rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-base font-bold text-[#1F1A17]">
                4. Cadence &amp; Pipeline Health
              </h2>
              <span className="text-xs text-[#CE4D47] font-semibold bg-[#FBEBE8] px-2 py-0.5 rounded-full border border-[#F7C6C2]">
                Conversion Funnel
              </span>
            </div>
            <p className="text-xs text-[#6B635B] mb-4">
              Identifies where prospects drop off between receiving a lead and conducting AI-coached outreach.
            </p>
          </div>

          {/* Visual Funnel Representation */}
          <div className="space-y-2.5 my-auto">
            {funnelStages.map((stage, idx) => {
              const widthPct = leads.length > 0 ? Math.max(25, Math.round((stage.count / leads.length) * 100)) : 100;
              return (
                <div key={stage.label} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-[#1F1A17] flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-[#FAF5EF] border border-[#EDE5DC] text-[#6B635B] text-[10px] flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      {stage.label}
                    </span>
                    <span className="text-[#1F1A17] font-bold">
                      {stage.count} <span className="text-[10px] text-[#8C827A] font-normal">({widthPct}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-[#FAF5EF] border border-[#EDE5DC] h-3 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className={`h-full rounded-full transition-all duration-300 ${stage.color}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 bg-[#FBEBE8] rounded-xl text-xs text-[#1F1A17] border border-[#F7C6C2]">
            <strong>Pipeline Tip:</strong> Generate a Call Brief for every claimed lead before dialing to increase your connected site-visit rate.
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Insights row ─────────────────────────────────────────────────────────────

function InsightsRow({ leads }) {
  const total = leads.length;
  const hot = leads.filter((l) => l.tag === "Hot").length;
  const hotPct = total > 0 ? Math.round((hot / total) * 100) : 0;
  const avgScore = total > 0
    ? Math.round(leads.reduce((s, l) => s + (l.score ?? 0), 0) / total)
    : 0;
  const open = leads.filter((l) => !l.claimed_by).length;
  const callsLogged = leads.reduce((acc, l) => acc + (Array.isArray(l.call_log) ? l.call_log.length : 0), 0);

  const cards = [
    { label: "Total leads", value: total },
    { label: "Hot leads", value: `${hot}`, sub: `${hotPct}% of total` },
    { label: "Avg score", value: `${avgScore}/100` },
    { label: "Open to claim", value: open },
    { label: "Calls logged", value: callsLogged },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-[#EDE5DC] rounded-xl px-4 py-3 shadow-2xs">
          <div className="text-xs text-[#8C827A] mb-1">{c.label}</div>
          <div className="text-xl font-semibold text-[#1F1A17]">{c.value}</div>
          {c.sub && <div className="text-xs text-[#6B635B] mt-0.5">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── Claim/Release cell ───────────────────────────────────────────────────────

function ClaimCell({ lead, currentUser, onClaim, onRelease, claimingId }) {
  const inFlight = claimingId === lead.id;
  const claimedBy = lead.claimed_by;
  const mine = claimedBy === currentUser;
  const theirs = claimedBy && !mine;

  if (theirs) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[#8C827A]">
        <svg className="w-3.5 h-3.5 text-[#8C827A] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="truncate max-w-[100px]">{claimedBy}</span>
      </div>
    );
  }

  if (mine) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2E7D32] bg-[#EBF7EE] border border-[#C8E6C9] rounded-full px-2 py-0.5 w-fit">
          ✓ Yours
        </span>
        <button onClick={(e) => { e.stopPropagation(); onRelease(lead.id); }}
          disabled={inFlight}
          className="text-xs text-[#8C827A] hover:text-[#CE4D47] transition-colors disabled:opacity-50">
          {inFlight ? "…" : "Release"}
        </button>
      </div>
    );
  }

  return (
    <button onClick={(e) => { e.stopPropagation(); onClaim(lead.id); }}
      disabled={inFlight}
      className="px-3 py-1 text-xs font-medium rounded-full border border-[#F7C6C2] text-[#CE4D47] hover:bg-[#FBEBE8] active:bg-[#FDE8E7] transition-colors disabled:opacity-50">
      {inFlight ? "…" : "Claim"}
    </button>
  );
}

// ─── Lead table row ───────────────────────────────────────────────────────────

function LeadRow({ lead, currentUser, onClaim, onRelease, claimingId, onClick }) {
  const tag = lead.tag || "Cold";
  const score = lead.score ?? 0;
  const analysis = lead.analysis || {};

  return (
    <tr className="hover:bg-[#FAF5EF]/60 transition-colors cursor-pointer" onClick={() => onClick(lead.id)}>
      {/* Priority */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${TAG_STYLES[tag] || TAG_STYLES.Cold}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${TAG_DOT[tag] || TAG_DOT.Cold}`} />
            {tag}
          </span>
          {Array.isArray(lead.call_log) && lead.call_log.length > 0 && (() => {
            const latest = lead.call_log[lead.call_log.length - 1];
            const diff = (latest.score_after ?? 0) - (latest.score_before ?? 0);
            return (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                diff > 0
                  ? "bg-[#EBF7EE] text-[#2E7D32]"
                  : diff < 0
                  ? "bg-[#FDE8E7] text-[#C53929]"
                  : "bg-[#FAF5EF] text-[#6B635B]"
              }`}>
                {diff >= 0 ? `+${diff}` : `${diff}`}
              </span>
            );
          })()}
        </div>
        <div className="mt-1 text-xs text-[#8C827A]">{score}/100</div>
      </td>

      {/* Customer */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm text-[#1F1A17] truncate max-w-[180px]">{lead.name}</span>
          {lead.call_brief && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FBEBE8] text-[#CE4D47] border border-[#F7C6C2]">
              Brief ready
            </span>
          )}
        </div>
        {lead.phone && (
          <div className="text-xs text-[#6B635B] font-mono mt-0.5 truncate max-w-[180px]">
            <span className="text-[#8C827A] font-sans mr-1">Tel:</span>{lead.phone}
          </div>
        )}
        {lead.email && (
          <div className="text-xs text-[#8C827A] truncate max-w-[180px]">
            <span className="mr-1">Email:</span>{lead.email}
          </div>
        )}
        {lead.location && (
          <div className="text-xs text-[#6B635B] truncate max-w-[180px] mt-0.5">
            <span className="text-[#8C827A] mr-1">Loc:</span>{lead.location}
          </div>
        )}
        {lead.property_requirement && (
          <div className="text-xs text-[#8C827A] truncate max-w-[180px]">
            <span className="mr-1">Req:</span>{lead.property_requirement}
          </div>
        )}
      </td>

      {/* Budget & Timeline */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="text-sm font-medium text-[#1F1A17]">{lead.budget || "—"}</div>
        <div className="text-xs text-[#6B635B] mt-0.5">{lead.timeline}</div>
      </td>

      {/* AI Summary */}
      <td className="px-4 py-3 max-w-[200px]">
        <p className="text-sm text-[#1F1A17] line-clamp-2">{analysis.summary || "—"}</p>
        {analysis.score_reason && (
          <p className="text-xs text-[#8C827A] mt-1 line-clamp-1">{analysis.score_reason}</p>
        )}
      </td>

      {/* Next action */}
      <td className="px-4 py-3">
        {analysis.next_action ? (
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium max-w-[180px] truncate ${
            tag === "Hot" ? "bg-[#FDE8E7] text-[#C53929] border border-[#F7C6C2]" :
            tag === "Warm" ? "bg-[#FEF3E2] text-[#B45309] border border-[#FDE3B7]" :
            "bg-[#F0ECE7] text-[#5C554E] border border-[#E2DBD3]"
          }`} title={analysis.next_action}>
            {analysis.next_action}
          </span>
        ) : <span className="text-[#8C827A] text-sm">—</span>}
      </td>

      {/* Salesperson / Claim */}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <ClaimCell
          lead={lead}
          currentUser={currentUser}
          onClaim={onClaim}
          onRelease={onRelease}
          claimingId={claimingId}
        />
      </td>
    </tr>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  // All leads from the server — never cleared on poll failure.
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState(null);

  // UI controls — these must never be reset by polling.
  const [tab, setTab] = useState("all"); // all | open | mine
  const [tagFilter, setTagFilter] = useState("all"); // all | Hot | Warm | Cold
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("score");

  // New lead form
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Claim/release
  const [claimingId, setClaimingId] = useState(null);
  const [claimError, setClaimError] = useState(null);

  // Seed
  const [seeding, setSeeding] = useState(false);

  // Ref to latest currentUser so polling closure always has the current value.
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Read localStorage once after mount to avoid hydration mismatch.
  useEffect(() => {
    const stored = localStorage.getItem("currentUser");
    if (stored) setCurrentUser(stored);
    setHydrated(true);
  }, []);

  // Fetch leads (used for initial load and poll refresh).
  // On poll failure: silently keep last good data — no error toast, no table clear.
  const fetchLeads = useCallback(async ({ silent = false } = {}) => {
    const user = currentUserRef.current;
    if (!user) return;
    if (!silent) setLeadsLoading(true);
    try {
      const res = await fetch("/api/leads", { headers: { "x-user": user } });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      // Only replace state when data actually changed — prevents table flicker.
      setLeads((prev) => {
        const prevStr = JSON.stringify(prev);
        const newStr = JSON.stringify(data);
        return prevStr === newStr ? prev : data;
      });
      if (!silent) setLeadsError(null);
    } catch (err) {
      if (!silent) setLeadsError("Could not load leads. " + err.message);
      // Silent poll failure: do nothing — last good data stays in state.
    } finally {
      if (!silent) setLeadsLoading(false);
    }
  }, []);

  // Initial load when user is set.
  useEffect(() => {
    if (currentUser) fetchLeads();
  }, [currentUser, fetchLeads]);

  // Polling: every 4 seconds, skip when tab is hidden.
  useEffect(() => {
    if (!currentUser) return;
    const id = setInterval(() => {
      if (document.hidden) return; // Don't poll when user switched tabs.
      fetchLeads({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id); // Clean up on unmount.
  }, [currentUser, fetchLeads]);

  // ── User management ──────────────────────────────────────────────────────────

  function handleSelectUser(user) {
    localStorage.setItem("currentUser", user);
    setCurrentUser(user);
  }

  function handleSwitchUser() {
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
    setLeads([]);
  }

  // ── Seed / reset ─────────────────────────────────────────────────────────────

  async function handleSeed() {
    if (!confirm("Reset all demo data? This will delete all current leads and insert 6 seed leads. This may take ~30 seconds.")) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "x-user": currentUser },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert("Seed failed: " + (body.error || res.status));
      } else {
        await fetchLeads();
      }
    } catch (err) {
      alert("Seed error: " + err.message);
    } finally {
      setSeeding(false);
    }
  }

  // ── New lead modal ───────────────────────────────────────────────────────────

  function openModal() {
    setFormData(EMPTY_FORM);
    setSubmitError(null);
    setShowModal(true);
  }

  function closeModal() {
    if (submitting) return;
    setShowModal(false);
    setSubmitError(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user": currentUser },
        body: JSON.stringify(formData),
      });
      const payload = await res.json();
      if (!res.ok) {
        setSubmitError(payload.error || `Error ${res.status}`);
        return;
      }
      setLeads((prev) =>
        [...prev, payload].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      );
      setShowModal(false);
    } catch (err) {
      setSubmitError("Could not reach the server. " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Claim / Release ──────────────────────────────────────────────────────────

  async function handleClaim(id) {
    setClaimingId(id);
    setClaimError(null);
    try {
      const res = await fetch(`/api/leads/${id}/claim`, {
        method: "POST",
        headers: { "x-user": currentUser },
      });
      const payload = await res.json();
      if (res.status === 409) {
        setClaimError(`Already claimed by ${payload.claimed_by}`);
        await fetchLeads({ silent: true });
        return;
      }
      if (!res.ok) {
        setClaimError(payload.error || `Error ${res.status}`);
        return;
      }
      // Optimistically update the local row.
      setLeads((prev) => prev.map((l) => (l.id === id ? payload : l)));
    } catch (err) {
      setClaimError("Claim failed: " + err.message);
    } finally {
      setClaimingId(null);
    }
  }

  async function handleRelease(id) {
    setClaimingId(id);
    setClaimError(null);
    try {
      const res = await fetch(`/api/leads/${id}/release`, {
        method: "POST",
        headers: { "x-user": currentUser },
      });
      const payload = await res.json();
      if (!res.ok) {
        setClaimError(payload.error || `Error ${res.status}`);
        return;
      }
      setLeads((prev) => prev.map((l) => (l.id === id ? payload : l)));
    } catch (err) {
      setClaimError("Release failed: " + err.message);
    } finally {
      setClaimingId(null);
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  function goToLead(id) {
    router.push(`/leads/${id}`);
  }

  // ── Filtering / sorting pipeline ─────────────────────────────────────────────

  // 1. Tab filter.
  const tabFiltered = leads.filter((l) => {
    if (tab === "open") return !l.claimed_by;
    if (tab === "mine") return l.claimed_by === currentUser;
    return true;
  });

  // 2. Tag filter.
  const tagFiltered = tagFilter === "all"
    ? tabFiltered
    : tabFiltered.filter((l) => l.tag === tagFilter);

  // 3. Search (name, location, property_requirement, phone).
  const q = search.trim().toLowerCase();
  const searched = q
    ? tagFiltered.filter((l) =>
        [l.name, l.location, l.property_requirement, l.phone]
          .some((f) => f?.toLowerCase().includes(q))
      )
    : tagFiltered;

  // 4. Sort.
  const displayed = applySort(searched, sort);

  // Top lead in the current filtered view (for "Open top lead" button).
  const topLead = displayed[0];

  // ── Tab counts (based on tag + search, not sort) ──────────────────────────────

  const tabCounts = {
    all: leads.length,
    open: leads.filter((l) => !l.claimed_by).length,
    mine: leads.filter((l) => l.claimed_by === currentUser).length,
  };

  // Tag pill counts reflect current tab + search.
  const tagCounts = {
    all: tabFiltered.filter((l) => q ? [l.name, l.location, l.property_requirement, l.phone].some((f) => f?.toLowerCase().includes(q)) : true).length,
    Hot: tabFiltered.filter((l) => l.tag === "Hot" && (q ? [l.name, l.location, l.property_requirement, l.phone].some((f) => f?.toLowerCase().includes(q)) : true)).length,
    Warm: tabFiltered.filter((l) => l.tag === "Warm" && (q ? [l.name, l.location, l.property_requirement, l.phone].some((f) => f?.toLowerCase().includes(q)) : true)).length,
    Cold: tabFiltered.filter((l) => l.tag === "Cold" && (q ? [l.name, l.location, l.property_requirement, l.phone].some((f) => f?.toLowerCase().includes(q)) : true)).length,
  };

  const hasFilters = tab !== "all" || tagFilter !== "all" || q !== "";

  // ── Render gates ─────────────────────────────────────────────────────────────

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF5EF]">
        <div className="w-6 h-6 border-2 border-[#CE4D47] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) return <SignInScreen onSelect={handleSelectUser} />;

  return (
    <div className="min-h-screen bg-[#FAF5EF]">
      {/* Header */}
      <header className="bg-white border-b border-[#EDE5DC] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#CE4D47] rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <span className="font-semibold text-[#1F1A17] text-sm">Leed Lens</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleSeed} disabled={seeding}
              className="text-xs text-[#8C827A] hover:text-[#CE4D47] transition-colors disabled:opacity-50"
              title="Demo only — deletes all leads and inserts 6 seed leads">
              {seeding ? "Seeding…" : "Reset demo data"}
            </button>
            <span className="text-sm text-[#6B635B] hidden sm:block">{currentUser}</span>
            <button onClick={handleSwitchUser}
              className="text-xs text-[#CE4D47] hover:text-[#B83E38] font-medium transition-colors">
              Switch user
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Insights row */}
        {leads.length > 0 && <InsightsRow leads={leads} />}

        {/* Title + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-xl font-semibold text-[#1F1A17]">Lead dashboard</h1>
          <div className="flex items-center gap-2">
            {topLead && (
              <button onClick={() => goToLead(topLead.id)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border border-[#F7C6C2] text-[#CE4D47] hover:bg-[#FBEBE8] transition-colors">
                Open top lead ↗
              </button>
            )}
            <button onClick={openModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#CE4D47] text-white text-sm font-medium rounded-xl hover:bg-[#B83E38] active:bg-[#A33530] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New lead
            </button>
          </div>
        </div>

        {/* Claim error banner */}
        {claimError && (
          <div className="mb-3 bg-[#FEF3E2] border border-[#FDE3B7] rounded-xl px-4 py-3 text-sm text-[#B45309] flex items-center justify-between">
            {claimError}
            <button onClick={() => setClaimError(null)} className="text-[#B45309] hover:text-[#78350F] ml-4">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-[#EDE5DC]">
          {[
            { key: "all", label: "All team leads", count: tabCounts.all },
            { key: "open", label: "Open to claim", count: tabCounts.open },
            { key: "mine", label: "My leads", count: tabCounts.mine },
            { key: "stats", label: "Lead stats", isStats: true },
          ].map(({ key, label, count, isStats }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                tab === key
                  ? "border-[#CE4D47] text-[#CE4D47]"
                  : "border-transparent text-[#6B635B] hover:text-[#1F1A17]"
              }`}>
              {label}
              {!isStats && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                  tab === key ? "bg-[#FBEBE8] text-[#CE4D47]" : "bg-[#FAF5EF] text-[#6B635B] border border-[#EDE5DC]"
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* When Lead Stats tab is active, display the visual analytics suite */}
        {tab === "stats" ? (
          <LeadStatsView
            leads={leads}
            currentUser={currentUser}
            onSelectLead={goToLead}
          />
        ) : (
          <>
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Priority pills */}
              <div className="flex items-center gap-1">
                {["all", "Hot", "Warm", "Cold"].map((f) => (
                  <button key={f} onClick={() => setTagFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      tagFilter === f
                        ? f === "all" ? "bg-[#1F1A17] text-white"
                          : f === "Hot" ? "bg-[#CE4D47] text-white"
                          : f === "Warm" ? "bg-[#D97706] text-white"
                          : "bg-[#8C827A] text-white"
                        : "bg-white border border-[#EDE5DC] text-[#6B635B] hover:bg-[#FAF5EF]"
                    }`}>
                    {f === "all" ? "All" : f}
                    <span className="ml-1 opacity-75">({tagCounts[f] ?? tagCounts["all"]})</span>
                  </button>
                ))}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Search */}
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8C827A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, location, phone…"
                  className="pl-8 pr-3 py-1.5 text-sm text-[#1F1A17] border border-[#EDE5DC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CE4D47] focus:border-transparent placeholder-[#A0988F] w-56 bg-white" />
              </div>

              {/* Sort */}
              <select value={sort} onChange={(e) => setSort(e.target.value)}
                className="text-sm text-[#1F1A17] border border-[#EDE5DC] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#CE4D47]">
                <option value="score">Highest score first</option>
                <option value="newest">Newest first</option>
                <option value="timeline">Most urgent timeline</option>
              </select>
            </div>

        {/* Content area */}
        {leadsLoading ? (
          <div className="flex items-center justify-center py-20 text-[#8C827A] gap-2">
            <svg className="w-5 h-5 animate-spin text-[#CE4D47]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading leads…
          </div>
        ) : leadsError ? (
          <div className="bg-[#FDE8E7] border border-[#F7C6C2] rounded-xl p-6 text-center text-sm text-[#C53929]">
            {leadsError}
            <button onClick={() => fetchLeads()}
              className="block mx-auto mt-3 text-xs font-medium text-[#CE4D47] hover:underline">
              Try again
            </button>
          </div>
        ) : leads.length === 0 ? (
          /* No leads at all */
          <div className="bg-white border border-[#EDE5DC] rounded-xl p-16 text-center">
            <div className="w-12 h-12 bg-[#FAF5EF] border border-[#EDE5DC] rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#8C827A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-[#1F1A17] font-medium">No leads yet</p>
            <p className="text-[#8C827A] text-sm mt-1">Click "New lead" to add your first one.</p>
          </div>
        ) : displayed.length === 0 ? (
          /* Leads exist but nothing matches the current filters */
          <div className="bg-white border border-[#EDE5DC] rounded-xl p-12 text-center">
            <p className="text-[#1F1A17] font-medium">No leads match your filters</p>
            <p className="text-[#8C827A] text-sm mt-1">Try adjusting the tab, priority, or search.</p>
            <button onClick={() => { setTab("all"); setTagFilter("all"); setSearch(""); }}
              className="mt-4 text-sm text-[#CE4D47] font-medium hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#EDE5DC] rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#EDE5DC] bg-[#FAF5EF]">
                    <th className="px-4 py-3 text-xs font-semibold text-[#6B635B] uppercase tracking-wide w-24">Priority</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#6B635B] uppercase tracking-wide">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#6B635B] uppercase tracking-wide w-32">Budget / Timeline</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#6B635B] uppercase tracking-wide">AI Summary</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#6B635B] uppercase tracking-wide">Next action</th>
                    <th className="px-4 py-3 text-xs font-semibold text-[#6B635B] uppercase tracking-wide w-28">Salesperson</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDE5DC]">
                  {displayed.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      currentUser={currentUser}
                      onClaim={handleClaim}
                      onRelease={handleRelease}
                      claimingId={claimingId}
                      onClick={goToLead}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
      )}
      </main>

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
