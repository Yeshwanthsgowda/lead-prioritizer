// app/api/leads/[id]/route.js
//
// GET handler for a single lead.
// WHY x-user check: Even for read operations, we enforce the demo salesperson
// identity to ensure all requests within the app come from an authenticated team member.
// WHY await params: In Next.js 15+, context.params can be a Promise, so awaiting it
// guarantees compatibility across runtime versions.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";

const ALLOWED_USERS = ["Salesperson A", "Salesperson B"];

export async function GET(request, context) {
  const user = request.headers.get("x-user");
  if (!user || !ALLOWED_USERS.includes(user)) {
    return NextResponse.json(
      { error: "x-user header must be 'Salesperson A' or 'Salesperson B'." },
      { status: 401 }
    );
  }

  // Await params defensively for Next.js App Router compatibility.
  const { id } = await Promise.resolve(context.params);

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// DELETE handler to delete a lead by ID.
// Either salesperson can delete demo leads if needed.
export async function DELETE(request, context) {
  const user = request.headers.get("x-user");
  if (!user || !ALLOWED_USERS.includes(user)) {
    return NextResponse.json(
      { error: "x-user header must be 'Salesperson A' or 'Salesperson B'." },
      { status: 401 }
    );
  }

  const { id } = await Promise.resolve(context.params);

  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Supabase error deleting lead:", error);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id }, { status: 200 });
}

