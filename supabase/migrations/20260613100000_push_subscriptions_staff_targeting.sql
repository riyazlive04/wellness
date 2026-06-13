-- =============================================================================
-- Push subscriptions — staff targeting
--
-- push_subscriptions was client-only (client_id NOT NULL, keyed on
-- (client_id, endpoint)). The Application-Flow NotificationHandler needs to
-- push to STAFF too (workspace owner / nutritionist) for staff-facing events
-- (client / invite / recipe create). Staff have no public.clients row, so we
-- add a user_id target and relax client_id to nullable.
--
-- Targeting model after this migration:
--   client_id  — set for client (PWA portal) subscriptions, NULL for staff
--   user_id    — auth.users.id of the subscriber (set for ALL subscriptions)
--   workspace_id — the workspace the subscription belongs to (for staff fan-out)
--
-- endpoint becomes the natural upsert key: a browser push endpoint is globally
-- unique per provider, so one row per endpoint regardless of client/user. This
-- replaces the (client_id, endpoint) unique, which can't dedupe rows whose
-- client_id is NULL (Postgres treats NULLs as distinct).
-- =============================================================================

-- 1. New subscriber target.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Staff subscriptions have no client row.
ALTER TABLE public.push_subscriptions
  ALTER COLUMN client_id DROP NOT NULL;

-- 3. Backfill user_id for existing client subscriptions.
UPDATE public.push_subscriptions ps
   SET user_id = c.user_id
  FROM public.clients c
 WHERE ps.client_id = c.id
   AND ps.user_id IS NULL;

-- 4. Switch the upsert key to endpoint.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_client_id_endpoint_key;
DROP INDEX IF EXISTS public.idx_push_subscriptions_endpoint;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

-- 5. Index the new target.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);

-- 6. A subscription must target at least one of client / user.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_target_chk;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_target_chk
  CHECK (client_id IS NOT NULL OR user_id IS NOT NULL);

-- 7. RLS — allow a user to manage their own (user_id) subscriptions, mirroring
-- the existing client-owner policy. Backend writes use the service connection
-- and bypass RLS, but this keeps direct/authenticated access correct.
DROP POLICY IF EXISTS "Users can manage their own user subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own user subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
