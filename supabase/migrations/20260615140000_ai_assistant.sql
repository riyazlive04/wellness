-- Module 6 — AI Personal Assistant Platform.
--
-- Three role-scoped assistants share one set of tables, distinguished by
-- `assistant_type` ('executive' | 'clinical' | 'wellness'):
--   executive → super admin (platform/business intelligence)
--   clinical  → workspace owner/nutritionist (practice operations)
--   wellness  → client (personal wellness companion)
--
-- Memory is isolated by (scope, scope_id) and never crosses a permission
-- boundary: business memory keys on the platform, workspace memory on the
-- workspace id, personal memory on the user id.

-- ── Conversations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assistant_type  text        NOT NULL,
  title           text        NOT NULL DEFAULT 'New conversation',
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_conversations_user_idx
  ON public.assistant_conversations (user_id, assistant_type, last_message_at DESC NULLS LAST);

-- ── Messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role            text        NOT NULL,                       -- 'user' | 'assistant' | 'system'
  content         text        NOT NULL,
  tokens          integer,
  latency_ms      integer,
  actions         jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- suggested actions on an assistant turn
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_messages_conversation_idx
  ON public.assistant_messages (conversation_id, created_at);

-- ── Memory (role-isolated) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_memory (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text        NOT NULL,                       -- 'business' | 'workspace' | 'personal'
  scope_id        text        NOT NULL,                       -- platform marker | workspace_id | user_id
  assistant_type  text        NOT NULL,
  key             text        NOT NULL,
  value           text        NOT NULL,
  source          text        NOT NULL DEFAULT 'user',        -- 'user' | 'inferred'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_memory_scope_key_idx
  ON public.assistant_memory (scope, scope_id, key);

-- ── Action audit trail ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_actions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        REFERENCES public.assistant_conversations(id) ON DELETE SET NULL,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assistant_type  text        NOT NULL,
  action_type     text        NOT NULL,
  status          text        NOT NULL,                       -- 'executed' | 'failed'
  params          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  result          jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_actions_user_idx
  ON public.assistant_actions (user_id, created_at DESC);
