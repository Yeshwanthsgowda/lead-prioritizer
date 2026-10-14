// lib/chat.js — AI Sales Coach chat helper.
//
// Grounds all answers in the lead context using plain text completions
// with conversational temperature 0.5 and token limit 600.

import Groq from "groq-sdk";
import { CHAT_SYSTEM_PROMPT, buildChatContext } from "./prompts.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Answer a question about a lead based on full lead context and past conversation.
 * @param {object} lead
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function answerChat(lead, history = [], question) {
  const context = buildChatContext(lead);
  const systemMessage = `${CHAT_SYSTEM_PROMPT}\n\nLEAD CONTEXT:\n${context}`;

  // Only pass the last 10 messages from history to keep tokens under limits
  const recentHistory = (history || [])
    .slice(-10)
    .filter((m) => m && m.role && m.content)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content),
    }));

  const messages = [
    { role: "system", content: systemMessage },
    ...recentHistory,
    { role: "user", content: question },
  ];

  let replyText = "";
  let lastError = null;

  // Single retry on failure or empty reply
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        temperature: 0.5,
        max_tokens: 600,
        messages,
      });

      const text = completion.choices[0]?.message?.content;
      if (text && typeof text === "string" && text.trim()) {
        replyText = text.trim();
        break;
      }

      throw new Error("Empty reply received from model.");
    } catch (err) {
      lastError = err;
      if (attempt === 1) {
        console.warn(`Chat attempt ${attempt} failed: ${err.message}. Retrying…`);
      }
    }
  }

  if (!replyText) {
    throw new Error(
      `AI coach failed to generate an answer. Last error: ${lastError?.message}`
    );
  }

  return replyText;
}
