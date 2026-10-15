// POST /api/leads/[id]/claim
//
// WHY one atomic UPDATE instead of SELECT then UPDATE:
// Two salespeople can click "Claim" at the exact same millisecond.
// If we read first and then write, both reads can see claimed_by IS NULL
// and both writes succeed — a race condition. By combining the ownership
// check (claimed_by IS NULL) into the WHERE clause of the UPDATE itself,
// only one write can win; the other updates zero rows and gets a 409.
//
// WHY claimed_by stores the user UUID (session.sub):
// The UUID is stable and unique. The user's display name can change;
// the UUID never does. Lookups and comparisons in the UI use the UUID
// and resolve the name separately.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function POST(request, context) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // params may be a Promise in Next.js 15+; await defensively.
  const { id } = await Promise.resolve(context.params);

  // Atomic claim scoped to team: only succeeds if no one else owns the lead yet.
  const { data, error } = await supabase
    .from("leads")
    .update({ claimed_by: session.sub, claimed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("team_id", session.team_id) // cannot claim a lead from another team
    .is("claimed_by", null)
    .select()
    .single();

  if (error || !data) {
    // No row was updated — either someone else claimed it or it doesn't exist.
    // Fetch the current state to return the claimer's name.
    const { data: current } = await supabase
      .from("leads")
      .select("claimed_by, team_id")
      .eq("id", id)
      .eq("team_id", session.team_id)
      .maybeSingle();

    if (!current) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Resolve the claimer's display name.
    let claimedByName = "someone else";
    if (current.claimed_by) {
      const { data: claimer } = await supabase
        .from("users")
        .select("name")
        .eq("id", current.claimed_by)
        .maybeSingle();
      if (claimer) claimedByName = claimer.name;
    }

    return NextResponse.json(
      { error: "Already claimed", claimed_by: claimedByName },
      { status: 409 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}
