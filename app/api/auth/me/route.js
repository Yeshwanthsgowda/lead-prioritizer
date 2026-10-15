// app/api/auth/me/route.js
//
// GET → { user, team }
//
// Returns the currently authenticated user and their team.
// Used by the client on mount to validate the stored token and
// hydrate user/team state without a full page reload.
//
// No logout route: JWTs are stateless and cannot be revoked before expiry.
// Logout is handled client-side by clearing the token from sessionStorage.
// This is acceptable for a 12 h expiry on a small team app.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Re-fetch the user and team from the DB so the response always reflects
  // the current state (e.g. if role changed after the token was issued).
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email, role, team_id, is_demo")
    .eq("id", session.sub)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, is_demo")
    .eq("id", user.team_id)
    .single();

  return NextResponse.json({ user, team });
}
