// app/api/team/invite/route.js
//
// POST → { invite_code }
//
// Generates a new invite code and saves it for the team.
// Owner-only. Demo teams cannot rotate codes (they have none and new
// members should use the demo endpoint instead of a real account).
//
// WHY codes can be rotated:
// If an invite code is shared publicly or accidentally, the owner can
// generate a new one. The old code stops working immediately; existing
// members (who already joined) are unaffected.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { generateInviteCode } from "@/lib/teams";

export async function POST(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.role !== "owner") {
    return NextResponse.json(
      { error: "Only the team owner can rotate the invite code." },
      { status: 403 }
    );
  }

  if (session.is_demo) {
    return NextResponse.json(
      { error: "The demo team does not use invite codes." },
      { status: 403 }
    );
  }

  let newCode;
  try {
    newCode = await generateInviteCode();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("teams")
    .update({ invite_code: newCode })
    .eq("id", session.team_id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to save new invite code." }, { status: 500 });
  }

  return NextResponse.json({ invite_code: newCode });
}
