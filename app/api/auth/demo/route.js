// app/api/auth/demo/route.js
//
// POST { which: "A" | "B" } → { token, user, team }
//
// Issues a JWT for one of the two demo salespeople without requiring a password.
// This lets anyone try the app instantly without signing up.
// The demo team and users are created idempotently on first call.

import { NextResponse } from "next/server";
import { ensureDemoTeam } from "@/lib/teams";
import { signSession } from "@/lib/auth";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const which = body?.which;
  if (which !== "A" && which !== "B") {
    return NextResponse.json(
      { error: "which must be \"A\" or \"B\"." },
      { status: 400 }
    );
  }

  let team, userA, userB;
  try {
    ({ team, userA, userB } = await ensureDemoTeam());
  } catch (err) {
    console.error("ensureDemoTeam failed:", err);
    return NextResponse.json(
      { error: "Could not set up demo team: " + err.message },
      { status: 500 }
    );
  }

  const user = which === "A" ? userA : userB;
  const token = await signSession(user);

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_demo: user.is_demo,
    },
    team: {
      id: team.id,
      name: team.name,
      is_demo: team.is_demo,
      invite_code: null, // never expose an invite code for the demo team
    },
  });
}
