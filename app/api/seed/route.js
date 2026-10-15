// POST /api/seed
//
// Demo-only: wipes the team's leads and inserts 6 genuine AI-analyzed seed leads.
// WHY sequential inserts: Groq has per-minute token rate limits. Running
// all 6 analyzes in parallel would likely hit the rate limit and fail.
// Sequential gives each call ~1-2 seconds of breathing room.
//
// WHY maxDuration = 60: 6 Groq calls sequentially can take 20-40 seconds
// in total. Vercel's default 10s timeout would kill the route mid-way.
//
// WHY is_demo check: Only demo sessions can reset demo data. Real teams
// should not be able to wipe their leads via a seed endpoint.

export const maxDuration = 60;

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { analyzeLead } from "@/lib/analyze";
import { getSession } from "@/lib/auth";
import { ensureDemoTeam } from "@/lib/teams";

// Raw seed data — no analysis yet. created_at is spread over the last 5 days
// so "Newest first" sorting shows meaningful order.
const now = Date.now();
const day = 24 * 60 * 60 * 1000;

// Seed data without created_by — we'll fill that in from the demo user IDs.
const SEED_LEADS_TEMPLATE = [
  {
    name: "Rohit Agarwal",
    phone: "9876500001",
    email: "rohit.agarwal@example.com",
    location: "Whitefield Bangalore",
    property_requirement: "3BHK ready-to-move near IT park",
    budget: "1.2-1.4 Cr",
    timeline: "Within 1 month",
    message:
      "Hi, my home loan is already approved by HDFC. We are relocating from Pune and need to move in before my kids' school starts next month. Can we do a site visit this Saturday? Also want to know if there is covered parking for 2 cars.",
    createdByIndex: 0, // A
    created_at: new Date(now - 0 * day).toISOString(),
  },
  {
    name: "Priya Nair",
    phone: "9876500002",
    email: null,
    location: "Sarjapur Road Bangalore",
    property_requirement: "2BHK apartment",
    budget: "around 85 lakh",
    timeline: "1-3 months",
    message:
      "Looking at 2BHK in Sarjapur. Saw your ad. What is the price per sqft? My husband thinks it is too far from his office in Koramangala though, so not sure.",
    createdByIndex: 1, // B
    created_at: new Date(now - 1 * day).toISOString(),
  },
  {
    name: "Arjun Mehta",
    phone: "9876500003",
    email: null,
    location: "Pune",
    property_requirement: "Maybe a plot or villa",
    budget: "",
    timeline: "Just exploring",
    message: "just looking around, send details",
    createdByIndex: 0, // A
    created_at: new Date(now - 2 * day).toISOString(),
  },
  {
    name: "Sneha Iyer",
    phone: "9876500004",
    email: "sneha.iyer@example.com",
    location: "Thane West Mumbai",
    property_requirement: "2BHK under-construction flat for parents",
    budget: "around 85 L",
    timeline: "3-6 months",
    message:
      "Hello, I want a 2bhk for my parents in Thane West. Under construction is ok if the builder is reliable. What are the payment plans? My father is retired so possession delay worries us.",
    createdByIndex: 1, // B
    created_at: new Date(now - 2.5 * day).toISOString(),
  },
  {
    name: "Vikram Singh",
    phone: "9876500005",
    email: null,
    location: "Hinjewadi Pune",
    property_requirement: "2BHK",
    budget: "80 lakh",
    timeline: "1-3 months",
    message:
      "bhai 2bhk chahiye hinjewadi me, budget 80 lakh tak hai. site visit kab ho sakta hai? loan ka bhi help chahiye. wife ko society acchi chahiye, gym aur garden wali.",
    createdByIndex: 0, // A
    created_at: new Date(now - 3.5 * day).toISOString(),
  },
  {
    name: "Rahul Sharma",
    phone: "9876500006",
    email: null,
    location: "Hinjewadi Pune",
    property_requirement: "2BHK apartment",
    budget: "80 lakh",
    timeline: "1-3 months",
    message: "Interested in 2BHK in Hinjewadi around 80 lakh. Please call me.",
    createdByIndex: 1, // B
    created_at: new Date(now - 4.5 * day).toISOString(),
  },
];

export async function POST(request) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Only demo sessions can use the seed endpoint.
  if (!session.is_demo) {
    return NextResponse.json(
      { error: "Seed is only available for demo accounts." },
      { status: 403 }
    );
  }

  // Get the demo user IDs for alternating created_by.
  let userA, userB;
  try {
    ({ userA, userB } = await ensureDemoTeam());
  } catch (err) {
    return NextResponse.json({ error: "Failed to load demo users: " + err.message }, { status: 500 });
  }

  const demoUsers = [userA.id, userB.id];

  // Wipe only this team's existing leads.
  const { error: deleteError } = await supabase
    .from("leads")
    .delete()
    .eq("team_id", session.team_id);

  if (deleteError) {
    console.error("Seed delete error:", deleteError);
    return NextResponse.json(
      { error: "Failed to clear existing leads." },
      { status: 500 }
    );
  }

  const inserted = [];
  const errors = [];

  // Sequential inserts — respect Groq rate limits.
  for (const lead of SEED_LEADS_TEMPLATE) {
    try {
      const { analysis, score, tag } = await analyzeLead({
        name: lead.name,
        location: lead.location,
        property_requirement: lead.property_requirement,
        budget: lead.budget,
        timeline: lead.timeline,
        message: lead.message,
      });

      const { data, error } = await supabase
        .from("leads")
        .insert({
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          location: lead.location,
          property_requirement: lead.property_requirement,
          budget: lead.budget || null,
          timeline: lead.timeline,
          message: lead.message,
          analysis,
          score,
          tag,
          team_id: session.team_id,
          created_by: demoUsers[lead.createdByIndex],
          created_at: lead.created_at,
        })
        .select()
        .single();

      if (error) {
        errors.push({ name: lead.name, error: error.message });
      } else {
        inserted.push(data);
      }
    } catch (err) {
      errors.push({ name: lead.name, error: err.message });
    }
  }

  return NextResponse.json(
    { inserted: inserted.length, errors },
    { status: errors.length > 0 ? 207 : 201 }
  );
}
