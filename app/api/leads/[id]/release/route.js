// POST /api/leads/[id]/release
//
// WHY we check claimed_by = session.sub in the WHERE:
// A salesperson should only be able to release a lead they personally claimed.
// Adding claimed_by = session.sub to the WHERE clause means the UPDATE is a no-op
// if the lead belongs to someone else — no separate read needed.
//
// WHY session.sub (UUID) instead of a name string:
// The UUID is the stable identifier. The display name could theoretically be
// changed later without affecting ownership checks.

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

  // Only clears ownership when the caller is the current owner,
  // and the lead belongs to the session's team.
  const { data, error } = await supabase
    .from("leads")
    .update({ claimed_by: null, claimed_at: null })
    .eq("id", id)
    .eq("team_id", session.team_id)
    .eq("claimed_by", session.sub)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "You can only release your own leads." },
      { status: 403 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}
