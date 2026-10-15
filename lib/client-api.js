// lib/client-api.js — Client-side auth helpers and fetch wrapper.
//
// WHY sessionStorage instead of localStorage:
// sessionStorage is per-tab. Two browser tabs can each be logged in as a
// different salesperson and the tokens don't overwrite each other. This is
// intentional: open A and B in two tabs to watch claims sync live.
//
// WHY the token is not in a cookie:
// HttpOnly cookies would be ideal for production, but they require an API
// route to set/clear them, adding round-trips. For this demo-first app
// sessionStorage is simpler and good enough.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const TOKEN_KEY = "lp_token";

/** Read the JWT from sessionStorage. Returns null if not present. */
export function getToken() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

/** Persist the JWT in sessionStorage. */
export function setToken(token) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TOKEN_KEY, token);
}

/** Remove the JWT from sessionStorage (logout). */
export function clearToken() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Fetch wrapper that attaches the Authorization header.
 * On 401 it clears the token and redirects to /login so the user
 * is not silently left in a broken state.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    // Token is invalid or expired — clear it and redirect to login.
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return res;
}

/**
 * useAuth hook: returns { user, team, loading, switchDemoUser, logout }.
 * Reads the token on mount, calls /api/auth/me. If missing or invalid,
 * redirects to /login.
 */
export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      router.replace("/login");
      return;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        clearToken();
        router.replace("/login");
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setTeam(data.team);
    } catch {
      clearToken();
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const switchDemoUser = useCallback(async (which) => {
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setToken(data.token);
      setUser(data.user);
      setTeam(data.team);
    } catch (err) {
      console.error("switchDemoUser failed:", err);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    router.replace("/login");
  }, [router]);

  return { user, team, loading, switchDemoUser, logout, refetch: fetchSession };
}
