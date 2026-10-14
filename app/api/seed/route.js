// POST /api/seed
//
// Demo-only: wipes all leads and inserts 6 genuine AI-analyzed seed leads.
// WHY sequential inserts: Groq has per-minute token rate limits. Running
// all 6 analyzes in parallel would likely hit the rate limit and fail.
// Sequential gives each call ~1-2 seconds of breathing room.
//
// WHY maxDuration = 60: 6 Groq calls sequentially can take 20-40 seconds
// in total. Vercel's default 10s timeout would kill the route mid-way.

export const maxDuration = 60;

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { analyzeLead } from "@/lib/analyze";

const ALLOWED_USERS = ["Salesperson A", "Salesperson B"];

// Raw seed data — no analysis yet. created_at is spread over the last 5 days
// so "Newest first" sorting shows meaningful order. created_by alternates
// between the two salespeople.
const now = Date.now();
const day = 24 * 60 * 60 * 1000;

const SEED_LEADS = [
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
    created_by: "Salesperson A",
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
    created_by: "Salesperson B",
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
    created_by: "Salesperson A",
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
    created_by: "Salesperson B",
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
    created_by: "Salesperson A",
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
    created_by: "Salesperson B",
    created_at: new Date(now - 4.5 * day).toISOString(),
  },
];

export async function POST(request) {
  const user = request.headers.get("x-user");
  if (!user || !ALLOWED_USERS.includes(user)) {
    return NextResponse.json(
      { error: "x-user header must be 'Salesperson A' or 'Salesperson B'." },
      { status: 401 }
    );
  }

  // Wipe all existing leads so we start from a clean slate.
  const { error: deleteError } = await supabase
    .from("leads")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // match all rows

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
  for (const lead of SEED_LEADS) {
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
          created_by: lead.created_by,
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
