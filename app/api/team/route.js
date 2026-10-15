// app/api/team/route.js
//
// GET → { team, members }
//
// Returns the current user's team details and member list.
// invite_code is omitted for the demo team — it has no code and
// we don't want to accidentally surface one.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, is_demo, invite_code")
    .eq("id", session.team_id)
    .single();

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const { data: members } = await supabase
    .from("users")
    .select("id, name, role")
    .eq("team_id", session.team_id)
    .order("role"); // owners first

  return NextResponse.json({
    team: {
      id: team.id,
      name: team.name,
      is_demo: team.is_demo,
      invite_code: team.is_demo ? null : team.invite_code,
    },
    members: members || [],
  });
}
