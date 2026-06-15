-- Module 9 — Communication & Collaboration Hub (team collaboration).
--
-- All existing messaging is client↔nutritionist (1:1). This adds the missing
-- INTERNAL team layer: workspace channels for multi-party staff chat, the
-- messages within them, and shared team notes (workflow coordination). Scoped
-- to a workspace; any staff member of that workspace participates.

-- ── Channels ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_channels (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text,
  is_general   boolean     NOT NULL DEFAULT false,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_channels_ws_idx
  ON public.team_channels (workspace_id, created_at);

-- ── Channel messages (multi-party, staff only) ───────────────────────
CREATE TABLE IF NOT EXISTS public.team_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid        NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sender_id    uuid,
  content      text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_messages_channel_idx
  ON public.team_messages (channel_id, created_at);

-- ── Shared notes (team coordination) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_notes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title        text,
  body         text        NOT NULL,
  pinned       boolean     NOT NULL DEFAULT false,
  created_by   uuid,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_notes_ws_idx
  ON public.team_notes (workspace_id, pinned DESC, updated_at DESC);
