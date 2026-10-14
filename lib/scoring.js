// Scoring logic lives here — NOT in the model response.
// The model gives sub_scores; we clamp, sum, and tag them in code.
// This is the single source of truth so the UI and API always agree.

const LIMITS = {
  budget: 25,
  timeline: 30,
  requirement: 20,
  engagement: 25,
};

/**
 * Clamp each sub-score to its allowed range.
 * Missing or non-numeric fields become 0.
 * @param {Record<string, unknown>} sub
 * @returns {{ budget: number, timeline: number, requirement: number, engagement: number }}
 */
export function clampSubScores(sub) {
  const result = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const raw = sub?.[key];
    const num = typeof raw === "number" ? raw : Number(raw);
    result[key] = isNaN(num) ? 0 : Math.max(0, Math.min(max, Math.round(num)));
  }
  return result;
}

/**
 * Sum the four clamped sub-scores into a total out of 100.
 * @param {{ budget: number, timeline: number, requirement: number, engagement: number }} sub
 * @returns {number}
 */
export function computeScore(sub) {
  return sub.budget + sub.timeline + sub.requirement + sub.engagement;
}

/**
 * Bucket the total score into a human-readable tag.
 * Hot >= 70, Warm 40-69, Cold < 40.
 * @param {number} score
 * @returns {"Hot"|"Warm"|"Cold"}
 */
export function computeTag(score) {
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Cold";
}
