// app/api/leads/[id]/route.js
//
// GET: Return a single lead by id, scoped to the session's team.
// DELETE: Delete a lead by id.
//
// WHY team_id filter on every query:
// A lead from another team must look identical to a missing lead (404),
// so cross-team reads are indistinguishable from not-found. This prevents
// information leakage even if a lead ID is guessed.
//
// WHY await params: In Next.js 15+, context.params can be a Promise.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { getSession } from "@/lib/auth";

/**
 * Resolve display names for created_by and claimed_by within the team.
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

export async function GET(request, context) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await Promise.resolve(context.params);

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("team_id", session.team_id) // scope to session's team
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const nameMap = await resolveUserNames(session.team_id);
  return NextResponse.json({
    ...data,
    created_by_name: nameMap[data.created_by] || null,
    claimed_by_name: nameMap[data.claimed_by] || null,
  });
}

export async function DELETE(request, context) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await Promise.resolve(context.params);

  // Verify the lead belongs to this team before deleting.
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", id)
    .eq("team_id", session.team_id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", id)
    .eq("team_id", session.team_id);

  if (error) {
    console.error("Supabase error deleting lead:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id }, { status: 200 });
}
