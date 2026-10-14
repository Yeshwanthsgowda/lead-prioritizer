// lib/callbrief.js — Generates structured call preparation briefs using Groq.
//
// Validates the response shape strictly and retries once on failure.
// Trims arrays to max bounds in code rather than failing.

import Groq from "groq-sdk";
import { CALLBRIEF_SYSTEM_PROMPT, buildCallBriefUserPrompt } from "./prompts.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Call Groq model with temperature 0.4 and json_object response format.
 * @param {string} userPrompt
 * @returns {Promise<object>}
 */
async function callGroqCallBrief(userPrompt) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CALLBRIEF_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from model for call brief.");

  return JSON.parse(raw);
}

/**
 * Validate that parsed data satisfies all call brief requirements.
 * Throws a descriptive error if structure is invalid.
 * @param {object} data
 */
function validateCallBrief(data) {
  if (typeof data !== "object" || data === null) {
    throw new Error("Call brief must be a JSON object.");
  }

  // Required string fields
  const requiredStrings = ["call_goal", "opening_line", "closing_ask"];
  for (const key of requiredStrings) {
    if (typeof data[key] !== "string" || !data[key].trim()) {
      throw new Error(`Missing or empty required string field "${key}".`);
    }
  }

  // recap: array of 1-4 strings
  if (!Array.isArray(data.recap) || data.recap.length < 1) {
    throw new Error(`"recap" must be an array with at least 1 string item.`);
  }
  for (const item of data.recap) {
    if (typeof item !== "string") {
      throw new Error(`All items in "recap" must be strings.`);
    }
  }

  // discovery_questions: array of exactly 3 objects with question and why_it_matters
  if (!Array.isArray(data.discovery_questions) || data.discovery_questions.length !== 3) {
    throw new Error(`"discovery_questions" must be an array of exactly 3 objects.`);
  }
  for (let i = 0; i < data.discovery_questions.length; i++) {
    const q = data.discovery_questions[i];
    if (typeof q !== "object" || q === null) {
      throw new Error(`discovery_questions[${i}] must be an object.`);
    }
    if (typeof q.question !== "string" || !q.question.trim()) {
      throw new Error(`discovery_questions[${i}].question must be a non-empty string.`);
    }
    if (typeof q.why_it_matters !== "string" || !q.why_it_matters.trim()) {
      throw new Error(`discovery_questions[${i}].why_it_matters must be a non-empty string.`);
    }
  }

  // objections: array of 0-3 objects with objection and response
  if (!Array.isArray(data.objections)) {
    throw new Error(`"objections" must be an array.`);
  }
  for (let i = 0; i < data.objections.length; i++) {
    const obj = data.objections[i];
    if (typeof obj !== "object" || obj === null) {
      throw new Error(`objections[${i}] must be an object.`);
    }
    if (typeof obj.objection !== "string" || !obj.objection.trim()) {
      throw new Error(`objections[${i}].objection must be a non-empty string.`);
    }
    if (typeof obj.response !== "string" || !obj.response.trim()) {
      throw new Error(`objections[${i}].response must be a non-empty string.`);
    }
  }

  // avoid: array of 1-3 strings
  if (!Array.isArray(data.avoid) || data.avoid.length < 1) {
    throw new Error(`"avoid" must be an array with at least 1 string item.`);
  }
  for (const item of data.avoid) {
    if (typeof item !== "string") {
      throw new Error(`All items in "avoid" must be strings.`);
    }
  }
}

/**
 * Generate, validate, and clean a call brief for a lead.
 * Retries once on invalid JSON or validation failure.
 * Trims arrays to specified maximum bounds.
 * @param {object} lead
 * @returns {Promise<object>}
 */
export async function generateCallBrief(lead) {
  const userPrompt = buildCallBriefUserPrompt(lead);
  let data;
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      data = await callGroqCallBrief(userPrompt);
      validateCallBrief(data);
      break;
    } catch (err) {
      lastError = err;
      if (attempt === 1) {
        console.warn(`Call brief attempt ${attempt} failed: ${err.message}. Retrying…`);
      }
    }
  }

  if (!data) {
    throw new Error(
      `Call brief generation failed after 2 attempts. Last error: ${lastError?.message}`
    );
  }

  // Trim arrays to maximum lengths in code rather than failing
  return {
    call_goal: data.call_goal.trim(),
    opening_line: data.opening_line.trim(),
    recap: data.recap.slice(0, 4).map((s) => s.trim()),
    discovery_questions: data.discovery_questions.slice(0, 3).map((q) => ({
      question: q.question.trim(),
      why_it_matters: q.why_it_matters.trim(),
    })),
    objections: data.objections.slice(0, 3).map((o) => ({
      objection: o.objection.trim(),
      response: o.response.trim(),
    })),
    closing_ask: data.closing_ask.trim(),
    avoid: data.avoid.slice(0, 3).map((s) => s.trim()),
  };
}
