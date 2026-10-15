// GET /api/leads  — return all leads for the session's team, ordered by score desc.
// POST /api/leads — validate input, run AI analysis, insert row for the session's team.
//
// WHY sessions replace x-user: The server now signs and verifies identity via
// HS256 JWTs. A client can no longer impersonate a user by sending an arbitrary
// header value. Every lead is scoped to a team_id, so salespeople from different
// teams never see each other's leads.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { analyzeLead } from "@/lib/analyze";
import { getSession } from "@/lib/auth";

const ALLOWED_TIMELINES = [
  "Within 1 month",
  "1-3 months",
  "3-6 months",
  "6+ months",
  "Just exploring",
];

/**
 * Resolve display names for created_by and claimed_by from the users table.
 * Returns a map of { [userId]: name } for the given team.
 */
async function resolveUserNames(teamId) {
  const { data: users } = await supabase
    .from("users")
    .select("id, name")
    .eq("team_id", teamId);
  const map = {};
  (users || []).forEach((u) => { map[u.id] = u.name; });
  return map;
}

// GET — Return all leads for the session's team sorted by score descending.
// Nulls are pushed last: a lead with no score hasn't been analysed yet and
// is less actionable.
export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("team_id", session.team_id)
    .order("score", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("GET /api/leads error:", error);
    return NextResponse.json({ error: "Failed to fetch leads." }, { status: 500 });
  }

  // Enrich leads with human-readable created_by_name and claimed_by_name
  // so the UI can show names without a separate lookup per lead.
  const nameMap = await resolveUserNames(session.team_id);
  const enriched = (data || []).map((lead) => ({
    ...lead,
    created_by_name: nameMap[lead.created_by] || null,
    claimed_by_name: nameMap[lead.claimed_by] || null,
  }));

  return NextResponse.json(enriched);
}

// POST — Create a new lead.
// Steps:
//  1. Authenticate via session.
//  2. Validate required fields.
//  3. Run AI analysis (may retry once internally).
//  4. Insert into Supabase with score, tag, team_id, and created_by.
//  5. Return the inserted row.
export async function POST(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { name, phone, email, location, property_requirement, budget, timeline, message } = body;

  // Validate required fields. name, phone, and message are the minimum
  // required to contact and qualify the lead. timeline must match the allowed list.
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    return NextResponse.json({ error: "phone number is required." }, { status: 400 });
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }
  if (!timeline || !ALLOWED_TIMELINES.includes(timeline)) {
    return NextResponse.json(
      { error: `timeline must be one of: ${ALLOWED_TIMELINES.join(", ")}.` },
      { status: 400 }
    );
  }

  // Run AI analysis. If it fails after retries we return 502 so
  // the UI knows it's an upstream problem, not a client mistake.
  let analysis, score, tag;
  try {
    ({ analysis, score, tag } = await analyzeLead({
      name: name.trim(),
      location: location?.trim() || "",
      property_requirement: property_requirement?.trim() || "",
      budget: budget?.trim() || "",
      timeline,
      message: message.trim(),
    }));
  } catch (err) {
    console.error("analyzeLead failed:", err);
    return NextResponse.json(
      { error: `AI analysis failed: ${err.message}` },
      { status: 502 }
    );
  }

  // Insert the new lead row with team_id from the session.
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      location: location?.trim() || null,
      property_requirement: property_requirement?.trim() || null,
      budget: budget?.trim() || null,
      timeline,
      message: message.trim(),
      analysis,
      score,
      tag,
      team_id: session.team_id,
      created_by: session.sub, // session.sub is the user UUID
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: "Failed to save lead." }, { status: 500 });
  }

  // Enrich the new lead with display names for immediate UI use.
  return NextResponse.json(
    {
      ...data,
      created_by_name: session.name,
      claimed_by_name: null,
    },
    { status: 201 }
  );
}
