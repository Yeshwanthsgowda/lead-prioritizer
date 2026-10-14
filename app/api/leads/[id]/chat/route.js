// app/api/leads/[id]/chat/route.js
//
// POST: Ask a question to the AI sales coach for a lead.
// DELETE: Clear the conversation history for a lead.
//
// WHY history comes from the database (and not client payload):
// 1. Context integrity: The browser cannot tamper with or fabricate past assistant/user messages.
// 2. Shared context: Both salespeople (A & B) collaborate on the same lead and share the same coaching thread.
//
// WHY the model only receives the last 10 messages:
// 1. Cost & rate limits: Slicing keeps context window predictable and tokens bounded.
// 2. Focus: Recent back-and-forth contains the immediate conversational objective.

import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { answerChat } from "@/lib/chat";

const ALLOWED_USERS = ["Salesperson A", "Salesperson B"];

export async function POST(request, context) {
  const user = request.headers.get("x-user");
  if (!user || !ALLOWED_USERS.includes(user)) {
    return NextResponse.json(
      { error: "x-user header must be 'Salesperson A' or 'Salesperson B'." },
      { status: 401 }
    );
  }

  const { id } = await Promise.resolve(context.params);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body?.message;
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message must be a non-empty string." }, { status: 400 });
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length > 1000) {
    return NextResponse.json(
      { error: "Message is too long (maximum 1000 characters)." },
      { status: 400 }
    );
  }

  // 1. Fetch current lead
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const existingChat = Array.isArray(lead.chat) ? lead.chat : [];

  // 2. Call AI coach
  let replyText = "";
  try {
    replyText = await answerChat(lead, existingChat, trimmedMessage);
  } catch (err) {
    console.error("answerChat error:", err);
    return NextResponse.json(
      { error: `AI chat failed: ${err.message}` },
      { status: 502 }
    );
  }

  // 3. Re-read the latest chat from DB to prevent overwriting messages added concurrently
  const { data: freshLead } = await supabase
    .from("leads")
    .select("chat")
    .eq("id", id)
    .single();

  const currentChat = Array.isArray(freshLead?.chat) ? freshLead.chat : existingChat;

  const userMsg = {
    role: "user",
    content: trimmedMessage,
    author: user,
    at: new Date().toISOString(),
  };

  const assistantMsg = {
    role: "assistant",
    content: replyText,
    at: new Date().toISOString(),
  };

  // Keep only the last 50 messages total in persistent storage
  const updatedChat = [...currentChat, userMsg, assistantMsg].slice(-50);

  const { error: updateError } = await supabase
    .from("leads")
    .update({ chat: updatedChat })
    .eq("id", id);

  if (updateError) {
    console.error("Supabase chat update error:", updateError);
    return NextResponse.json(
      { error: "Failed to save chat message." },
      { status: 500 }
    );
  }

  return NextResponse.json(updatedChat, { status: 200 });
}

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
    .update({ chat: [] })
    .eq("id", id);

  if (error) {
    console.error("Supabase clear chat error:", error);
    return NextResponse.json({ error: "Failed to clear chat." }, { status: 500 });
  }

  return NextResponse.json([], { status: 200 });
}
