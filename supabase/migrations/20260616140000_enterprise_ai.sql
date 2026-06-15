-- Module 12 — Enterprise AI Ecosystem.
--
-- Ties the AI layer together with three NEW capabilities the prior AI modules
-- (6-11) didn't have:
--   ai_recommendations    — a persisted store for AI suggestions across the
--                           platform (previously recos were generated live and
--                           thrown away). Status: new | applied | dismissed.
--   ai_governance_actions — AI-proposed high-impact actions that require HUMAN
--                           approval before they execute (governance/control).
--   ai_feedback           — thumbs up/down + notes on AI outputs, the learning
--                           signal that lets human-verified data improve quality.

-- ── Recommendations store (AI Decision/Recommendation Engine) ─────────
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope        text        NOT NULL DEFAULT 'clinical',   -- business | clinical | wellness
  user_id      uuid,
  type         text        NOT NULL DEFAULT 'general',
  title        text        NOT NULL,
  body         text        NOT NULL DEFAULT '',
  severity     text        NOT NULL DEFAULT 'info',        -- info | opportunity | risk
  source       text        NOT NULL DEFAULT 'ai',
  status       text        NOT NULL DEFAULT 'new',         -- new | applied | dismissed
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_recommendations_ws_idx
  ON public.ai_recommendations (workspace_id, status, created_at DESC);

-- ── Governance queue (human approval of AI actions) ──────────────────
CREATE TABLE IF NOT EXISTS public.ai_governance_actions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assistant_type text,
  proposed_by   text        NOT NULL DEFAULT 'ai',
  action_type   text        NOT NULL,
  title         text        NOT NULL,
  description   text,
  params        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status        text        NOT NULL DEFAULT 'pending',     -- pending | approved | rejected | executed | failed
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  review_note   text,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_governance_ws_idx
  ON public.ai_governance_actions (workspace_id, status, created_at DESC);

-- ── Feedback (learning signal) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  user_id      uuid        NOT NULL,
  subject_type text        NOT NULL,                        -- message | recommendation | insight
  subject_id   uuid,
  rating       text        NOT NULL,                        -- up | down
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_feedback_subject_idx
  ON public.ai_feedback (user_id, subject_type, subject_id)
  WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_feedback_ws_idx
  ON public.ai_feedback (workspace_id, created_at DESC);
