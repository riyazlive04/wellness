-- Native (mobile) push: device registration tokens for Firebase Cloud Messaging.
-- Parallel to public.push_subscriptions (which is browser web-push). Read/written
-- by the backend FcmService via raw SQL, so no Prisma model is required.

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  client_id   uuid,                              -- nullable: staff have no clients row
  token       text NOT NULL UNIQUE,              -- FCM registration token (natural key)
  platform    text NOT NULL DEFAULT 'android',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fcm_tokens_client_idx ON public.fcm_tokens (client_id);
CREATE INDEX IF NOT EXISTS fcm_tokens_user_idx   ON public.fcm_tokens (user_id);

-- RLS: the backend uses the service role (bypasses RLS), same as push_subscriptions.
-- Enable + lock down so the table isn't reachable via the anon/authenticated keys.
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
