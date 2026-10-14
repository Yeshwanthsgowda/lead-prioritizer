<!-- BEGIN:nextjs-agent-rules -->

Project: Real-estate lead prioritizer for a two-person sales team.
Stack: Next.js App Router, plain JavaScript (no TypeScript), Tailwind CSS,
Groq via groq-sdk, Supabase Postgres. Deployed on Vercel.

## Hard rules
- Secrets (GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY) are read ONLY
  inside app/api/* routes or server-only files. Never in client components.
  Never hardcode a key in source. .env.local must stay in .gitignore.
- Supabase is accessed ONLY from app/api/* routes with the service key.
  The browser never talks to Supabase directly.
- All prompts live in lib/prompts.js.
- The model returns sub_scores: budget 0-25, timeline 0-30, requirement 0-20,
  engagement 0-25. Score and tag are computed in code in lib/scoring.js
  (Hot >= 70, Warm 40-69, Cold < 40). Never trust a score or tag from the model.
- Validate every model response: required fields present, arrays are arrays,
  numbers are clamped. Retry once on invalid JSON, then return a clear error
  (502). No canned or mock AI responses anywhere.
- No TypeScript, no extra UI libraries, no ORM. Use @supabase/supabase-js
  and groq-sdk only, plus Next.js and Tailwind.

## Identity and team
- No real auth. The sign-in screen has two buttons: "Salesperson A" and
  "Salesperson B". The choice is stored client-side and sent with each API
  request (header x-user). State in the README that this is demo identity,
  not security.
- Every lead stores created_by, claimed_by, claimed_at.
- Claiming must be atomic: UPDATE ... SET claimed_by = me WHERE id = ? AND
  claimed_by IS NULL, and return 409 "Already claimed" if no row was updated.
- Releasing only succeeds if claimed_by equals the current user.
- The UI polls GET /api/leads every 4 seconds to stay in sync.
  No websockets, no Supabase Realtime.

## Data shape
leads table columns: id, created_at, name, phone, email, location, property_requirement,
budget, timeline, message, analysis (jsonb), call_brief (jsonb),
chat (jsonb array), call_log (jsonb array), score (int), tag (text),
created_by, claimed_by, claimed_at.
phone is required and email is optional. phone and email are never sent to the model.
score and tag are real columns because the UI filters and sorts on them.

analysis shape:
{ summary, intent,
  key_requirements (object of short key-value strings),
  missing_info [], objections [], next_action, suggested_response,
  score_reason,
  sub_scores { budget, timeline, requirement, engagement } }
Score and tag are derived from sub_scores in code, stored in the columns.

Timeline is a dropdown: "Within 1 month", "1-3 months", "3-6 months",
"6+ months", "Just exploring". Keep these exact strings so "urgent timeline
first" sorting works.

## Code style
- Client components that load data need "use client" and fetch inside
  useEffect to avoid hydration errors.
- Comments in API routes explain WHY, not just what.
- Short functions, clear names, small files. The owner must be able to
  read and explain every file.

## Process
- Work on ONE slice at a time. Do not build ahead of the current slice.
- Before executing, show a short plan. If the plan includes anything outside
  the current slice (auth, new libraries, extra pages), remove it.
- After each slice, list the files you created or changed and explain
  each in plain language.
- Do not touch files outside the current slice unless required, and say why.

<!-- END:nextjs-agent-rules -->
