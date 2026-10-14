// Server-only Supabase client.
// We import createClient here and export a single shared instance.
// This file must never be imported in a client component.
// SUPABASE_URL is the bare project URL (e.g. https://xyz.supabase.co).
// SUPABASE_SERVICE_KEY bypasses Row Level Security — keep it server-side only.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables."
  );
}

// Single shared instance — Next.js module caching means this runs once per
// server process, not on every request.
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default supabase;
