// lib/teams.js — Server-only team helpers.
//
// WHY server-only: this module talks to Supabase with the service key,
// which must never be exposed to the browser.

import { randomInt } from "crypto";
import supabase from "@/lib/supabase";

// Alphabet without look-alike characters (0/O, 1/I/l) for human-readable codes.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate an 8-character invite code formatted as XXXX-XXXX.
 * Retries up to 5 times on unique constraint violations.
 * @returns {Promise<string>} e.g. "ABCD-1234"
 */
export async function generateInviteCode(retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += ALPHABET[randomInt(ALPHABET.length)];
    }
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;

    // Check uniqueness in DB before returning.
    const { data } = await supabase
      .from("teams")
      .select("id")
      .eq("invite_code", formatted)
      .maybeSingle();

    if (!data) return formatted; // No collision — use this code.
  }
  throw new Error("Failed to generate a unique invite code after 5 attempts.");
}

/**
 * Idempotent: find or create the demo team and its two demo users.
 * Safe to call multiple times — uses upsert semantics.
 * @returns {Promise<{ team: object, userA: object, userB: object }>}
 */
export async function ensureDemoTeam() {
  // Find or create the demo team.
  let team;
  const { data: existingTeam } = await supabase
    .from("teams")
    .select("*")
    .eq("is_demo", true)
    .maybeSingle();

  if (existingTeam) {
    team = existingTeam;
  } else {
    // Generate an invite code so databases with a NOT NULL constraint on
    // teams.invite_code do not fail. This code is never exposed to clients
    // (api/team and api/auth/demo return invite_code: null for demo teams).
    let demoInviteCode = "DEMO-TEAM";
    const { data: codeConflict } = await supabase
      .from("teams")
      .select("id")
      .eq("invite_code", demoInviteCode)
      .maybeSingle();

    if (codeConflict) {
      demoInviteCode = await generateInviteCode();
    }

    const { data: newTeam, error: teamErr } = await supabase
      .from("teams")
      .insert({ name: "Demo team", is_demo: true, invite_code: demoInviteCode })
      .select()
      .single();
    if (teamErr) throw new Error("Failed to create demo team: " + teamErr.message);
    team = newTeam;
  }

  // Find or create Salesperson A (owner).
  const userA = await findOrCreateDemoUser({
    email: "demo-a@demo.invalid",
    name: "Salesperson A",
    role: "owner",
    team_id: team.id,
  });

  // Find or create Salesperson B (member).
  const userB = await findOrCreateDemoUser({
    email: "demo-b@demo.invalid",
    name: "Salesperson B",
    role: "member",
    team_id: team.id,
  });

  return { team, userA, userB };
}

/**
 * Internal helper: find a demo user by email or create them.
 */
async function findOrCreateDemoUser({ email, name, role, team_id }) {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("users")
    .insert({ email, name, role, team_id, is_demo: true, password_hash: null })
    .select()
    .single();

  if (error) throw new Error(`Failed to create demo user ${email}: ` + error.message);
  return created;
}
