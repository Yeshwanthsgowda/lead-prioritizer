// analyzeLead is the only place that talks to Groq.
// It validates the response strictly so bad model output never reaches
// the database or the UI.

import Groq from "groq-sdk";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from "./prompts.js";
import { clampSubScores, computeScore, computeTag } from "./scoring.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const REQUIRED_STRING_KEYS = [
  "summary",
  "intent",
  "next_action",
  "suggested_response",
  "score_reason",
];
const REQUIRED_ARRAY_KEYS = ["missing_info", "objections"];
const SUB_SCORE_KEYS = ["budget", "timeline", "requirement", "engagement"];

/**
 * Call the model and return the raw parsed object, or throw on failure.
 * @param {string} userPrompt
 * @returns {Promise<object>}
 */
async function callGroq(userPrompt) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from model.");

  // JSON.parse throws on invalid JSON — caller handles the retry.
  return JSON.parse(raw);
}

/**
 * Validate the parsed object has the shape we expect.
 * Throws a descriptive error if anything is missing or wrong.
 * @param {object} data
 */
function validate(data) {
  for (const key of REQUIRED_STRING_KEYS) {
    if (typeof data[key] !== "string" || !data[key].trim()) {
      throw new Error(`Missing or empty string field: "${key}".`);
    }
  }

  for (const key of REQUIRED_ARRAY_KEYS) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Field "${key}" must be an array.`);
    }
  }

  if (
    typeof data.key_requirements !== "object" ||
    data.key_requirements === null ||
    Array.isArray(data.key_requirements)
  ) {
    throw new Error(`"key_requirements" must be a plain object.`);
  }

  // All values in key_requirements should be strings.
  for (const [k, v] of Object.entries(data.key_requirements)) {
    if (typeof v !== "string") {
      throw new Error(
        `key_requirements["${k}"] must be a string, got ${typeof v}.`
      );
    }
  }

  if (
    typeof data.sub_scores !== "object" ||
    data.sub_scores === null ||
    Array.isArray(data.sub_scores)
  ) {
    throw new Error(`"sub_scores" must be a plain object.`);
  }

  for (const key of SUB_SCORE_KEYS) {
    const val = data.sub_scores[key];
    if (val === undefined || val === null) {
      throw new Error(`sub_scores["${key}"] is missing.`);
    }
    const num = Number(val);
    if (isNaN(num)) {
      throw new Error(`sub_scores["${key}"] must be numeric, got "${val}".`);
    }
  }
}

/**
 * Analyze a lead with Groq, validate the response, compute score and tag.
 * Retries once on invalid JSON or failed validation.
 * @param {{ name: string, location?: string, property_requirement?: string, budget?: string, timeline: string, message: string }} lead
 * @returns {Promise<{ analysis: object, score: number, tag: string }>}
 */
export async function analyzeLead(lead) {
  const userPrompt = buildAnalysisUserPrompt(lead);
  let data;
  let lastError;

  // Two attempts total — original call plus one retry.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      data = await callGroq(userPrompt);
      validate(data);
      break; // Success — exit the loop.
    } catch (err) {
      lastError = err;
      if (attempt === 1) {
        // Log and retry; on attempt 2 we fall through and throw below.
        console.warn(`Groq attempt ${attempt} failed: ${err.message}. Retrying…`);
      }
    }
  }

  if (!data) {
    throw new Error(
      `Lead analysis failed after 2 attempts. Last error: ${lastError?.message}`
    );
  }

  // Clamp sub_scores and compute score + tag in code.
  // We deliberately ignore any score or tag the model may have returned.
  const sub_scores = clampSubScores(data.sub_scores);
  const score = computeScore(sub_scores);
  const tag = computeTag(score);

  const analysis = {
    summary: data.summary,
    intent: data.intent,
    key_requirements: data.key_requirements,
    missing_info: data.missing_info,
    objections: data.objections,
    next_action: data.next_action,
    suggested_response: data.suggested_response,
    score_reason: data.score_reason,
    sub_scores,
  };

  return { analysis, score, tag };
}
