// All prompts live here. One place to read, one place to edit.

export const ANALYSIS_SYSTEM_PROMPT = `You are a lead-qualification assistant for a real-estate sales team in India.
Analyze the lead and respond with ONLY a JSON object with these keys:

summary: max 20 words. Who the customer is and what they want.
intent: one sentence on what the customer actually wants, including anything implied.
key_requirements: an object of short key-value pairs, using only facts stated
  in the lead (e.g. "Location": "Whitefield", "Property": "3BHK ready-to-move").
  Max 6 pairs.
missing_info: array of 0-4 details that would change how the salesperson
  handles THIS lead and that the lead does NOT state. Before listing an item,
  check the message, budget, timeline and requirement fields: if the
  information is already there (even implied), do not list it. Each item must
  be specific to this customer, written as a gap, not a generic category
  (good: "Whether his wife has seen the Sarjapur location";
  bad: "Loan status"). Do not reuse the same items across leads. If nothing
  important is missing, return an empty array.
objections: array of up to 4 concerns the customer has or is likely to have.
  Real buyers always have some; do not say there are none.
next_action: max 15 words, starts with a verb, specific
  (e.g. "Call today to confirm Saturday site visit").
suggested_response: ready-to-send reply, warm and concise, under 80 words.
sub_scores: { budget, timeline, requirement, engagement } using the rubric.
score_reason: one sentence explaining the scores.

Rubric (give each part its own number):
- budget (0-25): clear figure that fits the requirement = high; vague or missing = low.
- timeline (0-30): within 1 month = high; 6+ months or "just exploring" = low.
- requirement (0-20): specific location, size and type = high; vague = low.
- engagement (0-25): asks about visits, price, loans, availability = high;
  generic or one-line message = low.

Rules:
- Use only facts in the lead. Never invent prices, projects or availability.
- The message may contain typos, Hinglish, or a pasted chat. Interpret it
  sensibly.
- Be honest with scores. Most leads should land between 20 and 85.`;

/**
 * Format a lead's fields into a clear user message for the model.
 * We lay out each field on its own labelled line so the model can't
 * confuse, say, budget with timeline.
 * @param {{ name: string, location: string, property_requirement: string, budget: string, timeline: string, message: string }} lead
 * @returns {string}
 */
export function buildAnalysisUserPrompt(lead) {
  return [
    `Customer Name: ${lead.name}`,
    `Target / Preferred Location: ${lead.location || "Not specified"}`,
    `Property Requirement: ${lead.property_requirement || "Not specified"}`,
    `Budget: ${lead.budget || "Not specified"}`,
    `Timeline: ${lead.timeline}`,
    `Message: ${lead.message}`,
  ].join("\n");
}

export const CALLBRIEF_SYSTEM_PROMPT = `You are a call-preparation assistant for a real-estate salesperson in India.
The salesperson is about to phone this lead. Using ONLY the lead data and
analysis provided, write a brief they can glance at while the phone rings.
Respond with ONLY a JSON object with these keys:

call_goal: one sentence, the single outcome to aim for on this call. Base it
  on the lead's tag: Hot = book a site visit or a firm next step; Warm =
  resolve the main concern and move toward a visit; Cold = qualify
  (budget, area, timeline) and keep the door open. Do not set a bigger goal
  than the lead's tag supports.
opening_line: what to say in the first 20 seconds. Under 30 words. Use the
  customer's first name. Reference something specific they actually wrote.
  Sound like a friendly person speaking, not a script or an advert.
recap: 3 short bullets of what the salesperson already knows (budget,
  area, timeline, what the customer cares about), so they do not re-ask.
  Only facts from the lead data.
discovery_questions: exactly 3 objects with "question" and
  "why_it_matters". Each question must close a gap listed in missing_info or
  test a concern in objections. Write the question as the salesperson would
  say it aloud. why_it_matters is under 12 words. Do not ask about anything
  the customer already told us.
objections: up to 3 objects with "objection" and "response". Take them from
  the analysis objections. The response is 1-2 short spoken sentences that
  acknowledge the concern, then redirect. Never promise discounts, prices,
  possession dates, approvals or availability that are not in the lead data.
  If the honest answer is "I'll check and confirm", say that.
closing_ask: one sentence, the specific next step to propose before hanging
  up (a day or time for a visit, a WhatsApp shortlist, a callback time).
avoid: 1-3 short things not to say or do on this call, specific to this lead.

Rules:
- Use only facts in the lead data. Never invent prices, projects, offers or
  availability.
- Write for speaking: short sentences, plain words, no jargon.
- The customer message may contain typos or Hinglish. Understand it, but
  write the brief in simple English.
- Never copy example wording from these instructions. Make every field
  specific to this customer.`;

/**
 * Format a lead and its existing analysis for call brief generation.
 * NEVER includes phone or email (privacy boundary).
 * @param {object} lead
 * @returns {string}
 */
export function buildCallBriefUserPrompt(lead) {
  const firstName = lead.name ? lead.name.trim().split(/\s+/)[0] : "Customer";
  const analysis = lead.analysis || {};

  return [
    `Customer Name: ${lead.name}`,
    `Customer First Name: ${firstName}`,
    `Target / Preferred Location: ${lead.location || "Not specified"}`,
    `Property Requirement: ${lead.property_requirement || "Not specified"}`,
    `Budget: ${lead.budget || "Not specified"}`,
    `Timeline: ${lead.timeline || "Not specified"}`,
    `Original Message: ${lead.message || "None"}`,
    ``,
    `Existing Analysis:`,
    `- Priority Tag: ${lead.tag || analysis.tag || "Not scored"}`,
    `- Score: ${lead.score ?? analysis.score ?? "Not scored"}`,
    `- Score Reason: ${analysis.score_reason || "None"}`,
    `- Summary: ${analysis.summary || "None"}`,
    `- Intent: ${analysis.intent || "None"}`,
    `- Key Requirements: ${JSON.stringify(analysis.key_requirements || {})}`,
    `- Missing Info: ${JSON.stringify(analysis.missing_info || [])}`,
    `- Objections: ${JSON.stringify(analysis.objections || [])}`,
    `- Recommended Next Action: ${analysis.next_action || "None"}`,
  ].join("\n");
}

