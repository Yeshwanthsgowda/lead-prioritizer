// lib/auth.js — Server-only JWT utilities.
//
// WHY server-only: AUTH_SECRET is a signing key that must never reach the
// browser. If this module were imported in a client component, Next.js would
// bundle the key into the JS payload sent to the browser.
//
// WHY HS256 + a server-held secret instead of an asymmetric key:
// This is a small two-person team app. Symmetric HS256 is simpler to manage
// (one secret in env) and sufficient when the server both signs and verifies.
//
// WHY 12 h expiry: Long enough for a full workday without repeated logins,
// short enough to limit the damage window if a token leaks. No refresh tokens
// for now — the user logs in again when the session expires.

import { SignJWT, jwtVerify } from "jose";

// Read the secret once at module load time. If it is missing or too short,
// fail hard — a startup crash is better than silently running without auth.
const rawSecret = process.env.AUTH_SECRET;
if (!rawSecret || rawSecret.length < 32) {
  throw new Error(
    "AUTH_SECRET env var is missing or shorter than 32 characters. Set it in .env.local."
  );
}
const SECRET = new TextEncoder().encode(rawSecret);

/**
 * Sign a JWT for the given user object.
 * @param {{ id: string, name: string, team_id: string, role: string, is_demo: boolean }} user
 * @returns {Promise<string>} signed JWT string
 */
export async function signSession(user) {
  return new SignJWT({
    sub: user.id,
    name: user.name,
    team_id: user.team_id,
    role: user.role,
    is_demo: user.is_demo,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("12h")
    .sign(SECRET);
}

/**
 * Verify and decode the JWT from the Authorization header.
 * Returns the payload or null — never throws, so routes can handle
 * missing/invalid tokens gracefully with a simple null check.
 * @param {Request} request
 * @returns {Promise<object|null>}
 */
export async function getSession(request) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    // Invalid signature, expired, malformed — treat all as unauthenticated.
    return null;
  }
}
