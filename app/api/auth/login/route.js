// app/api/auth/login/route.js
//
// POST { email, password } → { token, user, team }
//
// WHY we return 401 with the same message for all failure cases
// (unknown email, wrong password, demo account, null password_hash):
// Revealing which email addresses exist lets attackers enumerate users.
// A uniform 401 message gives no useful signal.
//
// WHY demo users cannot log in here:
// Demo users have no password_hash. Calling the demo endpoint is the
// correct way to get a demo session. This prevents someone from trying
// to guess a demo user's password (they have none).

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import supabase from "@/lib/supabase";
import { signSession } from "@/lib/auth";

const GENERIC_401 = { error: "Incorrect email or password." };

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(GENERIC_401, { status: 401 });
  }

  // Fetch user by email. We only select the columns we need — never return password_hash.
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email, role, team_id, is_demo, password_hash")
    .eq("email", email)
    .maybeSingle();

  // All these cases look identical to the caller: unknown user, wrong password,
  // demo account (no password_hash), null hash from partial inserts.
  if (!user || user.is_demo || !user.password_hash) {
    return NextResponse.json(GENERIC_401, { status: 401 });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    return NextResponse.json(GENERIC_401, { status: 401 });
  }

  // Fetch the team for the response (exclude the invite_code from login response
  // for safety — let the dashboard fetch it separately via /api/team).
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, is_demo")
    .eq("id", user.team_id)
    .single();

  const token = await signSession(user);

  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, is_demo: false },
    team: team
      ? { id: team.id, name: team.name, is_demo: team.is_demo }
      : null,
  });
}
