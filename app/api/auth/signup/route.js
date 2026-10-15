// app/api/auth/signup/route.js
//
// POST { name, email, password, mode, teamName?, inviteCode? }
// → { token, user, team }
//
// mode "create": creates a new team + owner account.
// mode "join": looks up team by invite code, creates member account.
//
// WHY we hash with bcryptjs cost 10:
// Cost 10 takes ~100 ms, making brute-force attacks slow even if the DB leaks.
// We never select, log or return password_hash.
//
// WHY we delete the new team if user insert fails:
// The team and user must be created atomically. Supabase JS v2 doesn't support
// multi-statement transactions from the client library, so we clean up manually.

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import supabase from "@/lib/supabase";
import { generateInviteCode } from "@/lib/teams";
import { signSession } from "@/lib/auth";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const mode = body?.mode;

  // Validate common fields.
  if (!name || name.length < 1 || name.length > 100) {
    return NextResponse.json({ error: "Name must be 1–100 characters." }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!password || password.length < 8 || password.length > 72) {
    return NextResponse.json({ error: "Password must be 8–72 characters." }, { status: 400 });
  }
  if (mode !== "create" && mode !== "join") {
    return NextResponse.json({ error: "mode must be \"create\" or \"join\"." }, { status: 400 });
  }

  // Check for duplicate email before doing any expensive work.
  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingUser) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let team;

  if (mode === "create") {
    const teamName = typeof body?.teamName === "string" ? body.teamName.trim() : "";
    if (!teamName || teamName.length < 2 || teamName.length > 60) {
      return NextResponse.json({ error: "Team name must be 2–60 characters." }, { status: 400 });
    }

    let inviteCode;
    try {
      inviteCode = await generateInviteCode();
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const { data: newTeam, error: teamErr } = await supabase
      .from("teams")
      .insert({ name: teamName, is_demo: false, invite_code: inviteCode })
      .select()
      .single();

    if (teamErr) {
      return NextResponse.json({ error: "Failed to create team." }, { status: 500 });
    }

    team = newTeam;

    // Create the owner. If this fails, clean up the team.
    const { data: user, error: userErr } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash: passwordHash,
        role: "owner",
        team_id: team.id,
        is_demo: false,
      })
      .select("id, name, email, role, team_id, is_demo")
      .single();

    if (userErr) {
      // Roll back team creation so we don't leave orphaned teams.
      await supabase.from("teams").delete().eq("id", team.id);
      if (userErr.code === "23505") {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
    }

    const token = await signSession({ ...user, team_id: team.id });
    return NextResponse.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, is_demo: false },
      team: { id: team.id, name: team.name, is_demo: false, invite_code: team.invite_code },
    }, { status: 201 });
  }

  // mode === "join"
  let rawCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";
  // Normalise: strip hyphens, then re-insert hyphen after position 4.
  rawCode = rawCode.replace(/-/g, "");
  if (rawCode.length === 8) rawCode = `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;

  if (!rawCode) {
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
  }

  // Look up the team by invite code. Demo teams cannot be joined via invite.
  const { data: foundTeam } = await supabase
    .from("teams")
    .select("*")
    .eq("invite_code", rawCode)
    .maybeSingle();

  if (!foundTeam || foundTeam.is_demo) {
    // Return the same message whether the code is wrong or belongs to a demo
    // team — no information leakage.
    return NextResponse.json({ error: "Invalid invite code." }, { status: 400 });
  }

  team = foundTeam;

  const { data: user, error: userErr } = await supabase
    .from("users")
    .insert({
      name,
      email,
      password_hash: passwordHash,
      role: "member",
      team_id: team.id,
      is_demo: false,
    })
    .select("id, name, email, role, team_id, is_demo")
    .single();

  if (userErr) {
    if (userErr.code === "23505") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }

  const token = await signSession({ ...user, team_id: team.id });
  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, is_demo: false },
    team: { id: team.id, name: team.name, is_demo: false, invite_code: null },
  }, { status: 201 });
}
