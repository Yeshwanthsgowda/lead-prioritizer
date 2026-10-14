// POST /api/leads/[id]/release
//
// WHY we check claimed_by = x-user in the WHERE:
// A salesperson should only be able to release a lead they personally claimed.
// Adding claimed_by = x-user to the WHERE clause means the UPDATE is a no-op
// if the lead belongs to someone else — we never need a separate read to check.

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

  // Only clears ownership when the caller is the current owner.
  const { data, error } = await supabase
    .from("leads")
    .update({ claimed_by: null, claimed_at: null })
    .eq("id", id)
    .eq("claimed_by", user)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "You can only release your own leads." },
      { status: 403 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}
