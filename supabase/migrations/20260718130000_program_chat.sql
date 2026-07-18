-- 2026-07-18: Per-program group chat.
--
-- One shared room per program TEMPLATE, joined by the workspace's staff and
-- every client with an ACTIVE assignment to that program. It is a true group
-- chat: everyone in the room sees every message and every sender's name (a
-- product decision — clients in the same program see each other).
--
-- Membership is DERIVED, not stored: staff by workspace_members, clients by
-- program_assignments. So there is no separate membership table — enrolling in
-- the program IS joining the chat, and leaving removes access automatically.
--
-- sender_name / sender_role are denormalised at insert time so a reader can
-- render "who said this" without a join to other clients' or staff rows.

CREATE TABLE IF NOT EXISTS public.program_chat_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_id      uuid NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  sender_user_id   uuid,                            -- set for staff / nutritionist senders
  sender_client_id uuid,                            -- set for client senders (clients.id)
  sender_role      text NOT NULL DEFAULT 'client',  -- 'owner' | 'nutritionist' | 'client'
  sender_name      text NOT NULL,                   -- denormalised display name
  content          text NOT NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- The only hot query: a room's messages oldest→newest.
CREATE INDEX IF NOT EXISTS program_chat_template_idx
  ON public.program_chat_messages(template_id, created_at);

COMMENT ON TABLE public.program_chat_messages IS
  'Per-program group chat. Room = program template; members = workspace staff + clients with an active program_assignment.';

-- RLS (defence-in-depth). The NestJS backend uses the service role and is the
-- authoritative access-control point; these policies mirror that logic so a
-- direct (anon/authenticated) connection can only touch rooms the caller
-- belongs to. Same shape as assessment_form_templates.
ALTER TABLE public.program_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcm_member_rw ON public.program_chat_messages;
CREATE POLICY pcm_member_rw ON public.program_chat_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = program_chat_messages.workspace_id
         AND wm.user_id = auth.uid() AND wm.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.program_assignments pa
        JOIN public.clients c ON c.id = pa.client_id
       WHERE pa.template_id = program_chat_messages.template_id
         AND c.user_id = auth.uid() AND pa.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = program_chat_messages.workspace_id
         AND wm.user_id = auth.uid() AND wm.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.program_assignments pa
        JOIN public.clients c ON c.id = pa.client_id
       WHERE pa.template_id = program_chat_messages.template_id
         AND c.user_id = auth.uid() AND pa.status = 'active'
    )
  );
