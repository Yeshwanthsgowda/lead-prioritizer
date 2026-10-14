// GET /api/leads  — return all leads ordered by score desc (nulls last).
// POST /api/leads — validate input, run AI analysis, insert row.
//
// WHY x-user header: we have no real auth. The browser stores the chosen
// salesperson name in localStorage and sends it on every request. This lets
// us track who created a lead without a login system.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { analyzeLead } from "@/lib/analyze";

const ALLOWED_USERS = ["Salesperson A", "Salesperson B"];
const ALLOWED_TIMELINES = [
  "Within 1 month",
  "1-3 months",
  "3-6 months",
  "6+ months",
  "Just exploring",
];

// GET — Return all leads sorted by score descending so the hottest leads
// appear first. Nulls are pushed last because a lead with no score hasn't
// been analysed yet and is less actionable.
export async function GET() {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("score", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("GET /api/leads error:", error);
    return NextResponse.json({ error: "Failed to fetch leads." }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST — Create a new lead.
// Steps:
//  1. Authenticate the salesperson via x-user header.
//  2. Validate required fields.
//  3. Run AI analysis (may retry once internally).
//  4. Insert into Supabase with score, tag and created_by.
//  5. Return the inserted row.
export async function POST(request) {
  // Step 1: Who is submitting this lead?
  const user = request.headers.get("x-user");
  if (!user || !ALLOWED_USERS.includes(user)) {
    return NextResponse.json(
      { error: "x-user header must be 'Salesperson A' or 'Salesperson B'." },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { name, phone, email, location, property_requirement, budget, timeline, message } = body;

  // Step 2: Validate required fields. name, phone, and message are the minimum
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
      {
        error: `timeline must be one of: ${ALLOWED_TIMELINES.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  // Step 3: Run AI analysis. If it fails after retries we return 502 so
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

  // Step 4: Insert the new lead row.
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
      created_by: user,
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: "Failed to save lead." }, { status: 500 });
  }

  // Step 5: Return the inserted row so the UI can add it immediately.
  return NextResponse.json(data, { status: 201 });
}
