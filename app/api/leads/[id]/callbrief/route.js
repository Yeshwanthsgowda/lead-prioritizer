// app/api/leads/[id]/callbrief/route.js
//
// POST handler to generate and store a call brief for a lead.
//
// WHY the brief is stored in the database instead of regenerated on view:
// 1. Speed: Salespeople glancing at a lead right as the phone rings cannot wait 3-5s for LLM inference.
// 2. Cost: Multiple views or tab refreshes won't trigger unnecessary LLM API costs.
// 3. Stability: Both salespeople see the exact same stable briefing script.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { generateCallBrief } from "@/lib/callbrief";

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

  // Retrieve existing lead
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Lead must already be analyzed
  if (!lead.analysis) {
    return NextResponse.json(
      { error: "Cannot generate call brief for a lead without prior analysis." },
      { status: 400 }
    );
  }

  let brief;
  try {
    brief = await generateCallBrief(lead);
  } catch (err) {
    console.error("generateCallBrief failed:", err);
    return NextResponse.json(
      { error: `Call brief generation failed: ${err.message}` },
      { status: 502 }
    );
  }

  const call_brief = {
    ...brief,
    generated_at: new Date().toISOString(),
    generated_by: user,
  };

  // Update call_brief column in Supabase
  const { data: updatedLead, error: updateError } = await supabase
    .from("leads")
    .update({ call_brief })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("Supabase call_brief update error:", updateError);
    return NextResponse.json(
      { error: "Failed to save call brief to database." },
      { status: 500 }
    );
  }

  return NextResponse.json(updatedLead, { status: 200 });
}
