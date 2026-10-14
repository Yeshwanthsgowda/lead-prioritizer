// POST /api/leads/[id]/claim
//
// WHY one atomic UPDATE instead of SELECT then UPDATE:
// Two salespeople can click "Claim" at the exact same millisecond.
// If we read first and then write, both reads can see claimed_by IS NULL
// and both writes succeed — a race condition. By combining the ownership
// check (claimed_by IS NULL) into the WHERE clause of the UPDATE itself,
// only one write can win; the other updates zero rows and gets a 409.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";

const ALLOWED_USERS = ["Salesperson A", "Salesperson B"];

export async function POST(request, context) {
  // params may be a Promise in Next.js 15+; await defensively.
  const { id } = await Promise.resolve(context.params);

  const user = request.headers.get("x-user");
  if (!user || !ALLOWED_USERS.includes(user)) {
    return NextResponse.json(
      { error: "x-user header must be 'Salesperson A' or 'Salesperson B'." },
      { status: 401 }
    );
  }

  // Atomic claim: only succeeds if no one else owns the lead yet.
  const { data, error } = await supabase
    .from("leads")
    .update({ claimed_by: user, claimed_at: new Date().toISOString() })
    .eq("id", id)
    .is("claimed_by", null)
    .select()
    .single();

  if (error || !data) {
    // No row was updated — someone else claimed it first. Read the current
    // owner so we can tell the UI whose name to show.
    const { data: current } = await supabase
      .from("leads")
      .select("claimed_by")
      .eq("id", id)
      .single();

    return NextResponse.json(
      {
        error: "Already claimed",
        claimed_by: current?.claimed_by ?? "someone else",
      },
      { status: 409 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}
