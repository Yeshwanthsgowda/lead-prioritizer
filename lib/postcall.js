// lib/postcall.js — Processes salesperson call notes to update lead analysis.
//
// WHY: Post-call evaluation must re-score the lead strictly based on call facts,
// clamp sub-scores, compute the total score and tag in code (never trusting model tags),
// and retry once on invalid JSON or failed schema validation before failing with a 502.

import Groq from "groq-sdk";
import { POSTCALL_SYSTEM_PROMPT, buildPostCallUserPrompt } from "./prompts.js";
import { clampSubScores, computeScore, computeTag } from "./scoring.js";
import { TIMELINE_ORDER } from "./constants.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Call Groq model with temperature 0.2 and json_object response format.
 * @param {string} userPrompt
 * @returns {Promise<object>}
 */
async function callGroqPostCall(userPrompt) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: POSTCALL_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from model for post-call update.");

  return JSON.parse(raw);
}

/**
 * Validate that parsed data satisfies all post-call requirements.
 * Throws a descriptive error if structure is invalid.
 * @param {object} data
 */
function validatePostCall(data) {
  if (typeof data !== "object" || data === null) {
    throw new Error("Post-call update must be a JSON object.");
  }

  // Required string fields
  const requiredStrings = ["call_summary", "score_change_reason", "next_action", "suggested_response"];
  for (const key of requiredStrings) {
    if (typeof data[key] !== "string" || !data[key].trim()) {
      throw new Error(`Missing or empty required string field "${key}".`);
    }
  }

  // sub_scores must be an object with four numeric fields
  if (typeof data.sub_scores !== "object" || data.sub_scores === null) {
    throw new Error(`"sub_scores" must be an object with budget, timeline, requirement, and engagement.`);
  }
  for (const key of ["budget", "timeline", "requirement", "engagement"]) {
    if (typeof data.sub_scores[key] !== "number" || isNaN(data.sub_scores[key])) {
      throw new Error(`sub_scores.${key} must be a number.`);
    }
  }

  // key_requirements: object of string values
  if (typeof data.key_requirements !== "object" || data.key_requirements === null || Array.isArray(data.key_requirements)) {
    throw new Error(`"key_requirements" must be an object of key-value string pairs.`);
  }
  for (const [k, v] of Object.entries(data.key_requirements)) {
    if (typeof v !== "string") {
      throw new Error(`Value for key_requirement "${k}" must be a string.`);
    }
  }

  // Arrays
  const arrayFields = ["missing_info", "objections", "questions_answered", "questions_still_open"];
  for (const field of arrayFields) {
    if (!Array.isArray(data[field])) {
      throw new Error(`"${field}" must be an array.`);
    }
    for (const item of data[field]) {
      if (typeof item !== "string") {
        throw new Error(`All items in "${field}" must be strings.`);
      }
    }
  }

  // updated_timeline: allowed timeline string or null
  if (data.updated_timeline !== null && data.updated_timeline !== undefined) {
    if (typeof data.updated_timeline !== "string" || !TIMELINE_ORDER.includes(data.updated_timeline)) {
      // Per instructions: If updated_timeline is not one of the five allowed strings, treat it as null.
      data.updated_timeline = null;
    }
  } else {
    data.updated_timeline = null;
  }

  // updated_budget: string or null
  if (data.updated_budget !== null && data.updated_budget !== undefined) {
    if (typeof data.updated_budget !== "string" || !data.updated_budget.trim()) {
      data.updated_budget = null;
    } else {
      data.updated_budget = data.updated_budget.trim();
    }
  } else {
    data.updated_budget = null;
  }
}

/**
 * Trims arrays and key-value limits to reasonable bounds.
 * @param {object} data
 * @returns {object}
 */
function normalizePostCall(data) {
  // Trim arrays to specified bounds
  const missing_info = data.missing_info.slice(0, 4);
  const objections = data.objections.slice(0, 4);
  const questions_answered = data.questions_answered.slice(0, 5);
  const questions_still_open = data.questions_still_open.slice(0, 5);

  // Limit key_requirements to max 8 pairs
  const key_requirements = {};
  const entries = Object.entries(data.key_requirements).slice(0, 8);
  for (const [k, v] of entries) {
    key_requirements[k] = v;
  }

  // Clamp sub-scores in code and derive score and tag
  const sub_scores = clampSubScores(data.sub_scores);
  const score = computeScore(sub_scores);
  const tag = computeTag(score);

  return {
    call_summary: data.call_summary.trim(),
    sub_scores,
    score,
    tag,
    score_change_reason: data.score_change_reason.trim(),
    key_requirements,
    missing_info,
    objections,
    questions_answered,
    questions_still_open,
    next_action: data.next_action.trim(),
    suggested_response: data.suggested_response.trim(),
    updated_timeline: data.updated_timeline,
    updated_budget: data.updated_budget,
  };
}

/**
 * Main post-call processing function.
 * Evaluates notes against lead data, retrying once on failure.
 *
 * @param {object} lead
 * @param {string} notes
 * @returns {Promise<object>}
 */
export async function processCall(lead, notes) {
  const userPrompt = buildPostCallUserPrompt(lead, notes);

  // Attempt 1
  try {
    const raw = await callGroqPostCall(userPrompt);
    validatePostCall(raw);
    return normalizePostCall(raw);
  } catch (err1) {
    console.warn("processCall attempt 1 failed, retrying once:", err1.message);

    // Attempt 2 (retry once)
    try {
      const raw = await callGroqPostCall(userPrompt);
      validatePostCall(raw);
      return normalizePostCall(raw);
    } catch (err2) {
      console.error("processCall attempt 2 failed:", err2.message);
      throw new Error(`AI post-call evaluation failed: ${err2.message}`);
    }
  }
}
