-- Security fix: stop deriving privileged roles from user-controlled signup metadata.
--
-- THREAT
-- `ensure_user_role(uuid)` is SECURITY DEFINER (runs as the table owner, bypasses
-- RLS) and is callable by any authenticated user (default PUBLIC EXECUTE; the
-- frontend calls it on every login). Its previous body read
-- `raw_user_meta_data->>'role'` — which the caller sets themselves at signup via
-- supabase.auth.signUp({ options: { data: { role: 'admin' } } }) — and its
-- whitelist accepted 'admin' and 'manager'. So the flow was:
--
--   1. sign up with metadata role = 'admin'   (attacker-controlled)
--   2. log in -> app calls ensure_user_role(self)
--   3. function reads 'admin' from metadata, passes the whitelist,
--      and INSERTs user_roles(self, 'admin') AS OWNER, bypassing the
--      write-lock that RLS otherwise puts on user_roles
--
-- A self-granted 'admin' (or 'manager') then satisfies the surviving
-- has_role(uid,'admin') / is_admin() policies on clients, assessments, files,
-- daily_logs, meal_logs, weekly_plans, meal_cards, weekly_reports, recipes,
-- food_items — granting cross-tenant READ and WRITE of every workspace's client
-- PII and health data to the direct (anon-key) Supabase path. The NestJS API is
-- unaffected (it checks super_admin only), but the legacy direct-to-Supabase
-- surface is fully exposed.
--
-- handle_new_user() had the identical metadata->role logic. Its trigger
-- (on_auth_user_created) was dropped in 20251215150000 and never re-attached, so
-- it is currently dead — but it is a landmine: re-adding the trigger would
-- reintroduce the hole, and its ON CONFLICT DO UPDATE would OVERWRITE an existing
-- role from metadata on every signup event.
--
-- FIX
-- Neither function may read raw_user_meta_data for role, and neither may ever
-- overwrite an existing role. New accounts are always 'client'. Elevation happens
-- only through controlled server-side paths (admin edge functions / the backend).
-- Existing legitimately-granted roles are preserved untouched.

-- 1. The LIVE path.
CREATE OR REPLACE FUNCTION public.ensure_user_role(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  -- If a role already exists, return it UNCHANGED. Never recompute, never
  -- overwrite — that is how a real admin/manager keeps their role, and how a
  -- client can never be silently downgraded.
  SELECT role INTO _role FROM public.user_roles WHERE user_id::text = p_user_id::text;
  IF _role IS NOT NULL THEN
    RETURN _role;
  END IF;

  -- No row yet: every new account is a client. raw_user_meta_data is DELIBERATELY
  -- not read — it is attacker-controlled at signup and was the escalation vector.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id::text, 'client')
  ON CONFLICT (user_id) DO NOTHING;   -- never overwrite a concurrent/existing row

  SELECT role INTO _role FROM public.user_roles WHERE user_id::text = p_user_id::text;
  RETURN COALESCE(_role, 'client');
END;
$$;

-- 2. The dead-but-dangerous trigger function. Kept (not dropped) so that if the
--    trigger is ever re-attached it is SAFE by construction, but stripped of the
--    metadata->role logic and the role-overwriting upsert. The profiles bootstrap
--    (harmless, useful) is preserved.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    name  = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email;

  -- Always 'client'. No metadata role, and DO NOTHING so an existing role is
  -- never clobbered.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id::text, 'client')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- NOTE: this migration does NOT retroactively revoke any 'admin'/'manager' row
-- that may already have been self-granted. If the prod confirmation shows the
-- vector was live, audit public.user_roles for unexpected admin/manager grants
-- separately (see the accompanying read-only check).
