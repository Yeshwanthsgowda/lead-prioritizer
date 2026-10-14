// app/api/leads/[id]/update/route.js
//
// POST handler to evaluate a completed sales call, log notes, and re-score the lead.
//
// WHY only the claimed salesperson can log a call:
// The salesperson who has claimed and owns the lead conducts the active dialogue and
// owns the customer's ongoing call history. Preventing accidental updates from other reps
// keeps accountability clear and prevents conflicting notes.
//
// WHY score and tag are recomputed in code:
// The model returns sub_scores based on rubric evidence, but overall score (0-100)
// and tag (Hot/Warm/Cold) are computed deterministically in code (lib/scoring.js).
// We never trust a score or tag from the model, ensuring consistent thresholds across the app.
//
// WHY the model is instructed to move a sub-score only when notes give evidence:
// Real-estate deals evolve incrementally. If a call was brief or inconclusive on budget,
// the prior qualified budget remains intact rather than resetting to 0. Moving scores only
// with evidence ensures stability while allowing downward adjustments when blockers arise.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { processCall } from "@/lib/postcall";

const ALLOWED_USERS = ["Salesperson A", "Salesperson B"];

export async function POST(request, context) {
  const user = request.headers.get("x-user");
  if (!user || !ALLOWED_USERS.includes(user)) {
    return NextResponse.json(
      { error: "x-user header must be 'Salesperson A' or 'Salesperson B'." },
      { status: 401 }
    );
  }

  const { id } = await Promise.resolve(context.params);

  // Validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  if (!notes || notes.length < 20 || notes.length > 4000) {
    return NextResponse.json(
      { error: "Call notes must be between 20 and 4000 characters." },
      { status: 400 }
    );
  }

  // Retrieve existing lead from database
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Lead must have existing analysis to be updated
  if (!lead.analysis) {
    return NextResponse.json(
      { error: "Lead must have an initial analysis before logging a call." },
      { status: 400 }
    );
  }

  // Ownership verification: only the salesperson who claimed this lead can log calls
  if (lead.claimed_by !== user) {
    return NextResponse.json(
      { error: "Claim this lead to log a call" },
      { status: 403 }
    );
  }

  // Run AI post-call evaluation
  let callResult;
  try {
    callResult = await processCall(lead, notes);
  } catch (err) {
    console.error("processCall failed:", err);
    // On AI failure, return 502 with clear message and save nothing
    return NextResponse.json(
      { error: `Post-call re-scoring failed: ${err.message}` },
      { status: 502 }
    );
  }

  const now = new Date().toISOString();
  const scoreBefore = lead.score ?? 0;
  const tagBefore = lead.tag || "Cold";

  // Build single call_log entry
  const newCallLogEntry = {
    at: now,
    by: user,
    notes,
    summary: callResult.call_summary,
    score_before: scoreBefore,
    score_after: callResult.score,
    tag_before: tagBefore,
    tag_after: callResult.tag,
    reason: callResult.score_change_reason,
    questions_answered: callResult.questions_answered,
    questions_still_open: callResult.questions_still_open,
  };

  // Keep last 20 call log entries
  const currentLog = Array.isArray(lead.call_log) ? lead.call_log : [];
  const updatedCallLog = [...currentLog, newCallLogEntry].slice(-20);

  // Merge analysis: keep summary, intent, etc. and update sub_scores, reason, requirements, etc.
  const mergedAnalysis = {
    ...lead.analysis,
    sub_scores: callResult.sub_scores,
    score_reason: callResult.score_change_reason,
    key_requirements: callResult.key_requirements,
    missing_info: callResult.missing_info,
    objections: callResult.objections,
    next_action: callResult.next_action,
    suggested_response: callResult.suggested_response,
  };

  // Prepare database updates
  const updates = {
    analysis: mergedAnalysis,
    score: callResult.score,
    tag: callResult.tag,
    call_log: updatedCallLog,
  };

  // Conditionally update timeline and budget if explicit valid updates were returned
  if (callResult.updated_timeline) {
    updates.timeline = callResult.updated_timeline;
  }
  if (callResult.updated_budget) {
    updates.budget = callResult.updated_budget;
  }

  // If call_brief exists, flag it as stale without automatically regenerating it
  if (lead.call_brief) {
    const callDateStr = new Date(now).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
    updates.call_brief = {
      ...lead.call_brief,
      stale: true,
      stale_reason: `Written before the call on ${callDateStr}`,
    };
  }

  // Persist all updates to Supabase in one write
  const { data: updatedLead, error: updateError } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Supabase lead update error:", updateError);
    return NextResponse.json(
      { error: "Failed to persist call update to database." },
      { status: 500 }
    );
  }

  return NextResponse.json(updatedLead, { status: 200 });
}
