-- ============================================================================
-- DEBUG FIX: Final Constraints Resolution
-- ============================================================================
-- Objectives:
-- 1. Ensure Unique Constraints exist on daily_logs and user_achievements with KNOWN names.
-- 2. Update functions to explicitly refer to these constraints to avoid ambiguity.
-- 3. Ensure column types are correct.

-- ----------------------------------------------------------------------------
-- 1. SETUP: Clean up functions to avoid dependency errors during alter
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.log_daily_metric(uuid, text, numeric, date);
DROP FUNCTION IF EXISTS public.check_user_achievements(uuid, text, integer);
DROP TRIGGER IF EXISTS on_daily_log_change ON public.daily_logs;
DROP FUNCTION IF EXISTS public.handle_daily_log_stats();

-- ----------------------------------------------------------------------------
-- 2. DAILY LOGS: Fix Constraints
-- ----------------------------------------------------------------------------

-- A. Clean duplicates (paranoid check)
DELETE FROM public.daily_logs
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id, log_date ORDER BY updated_at DESC) as rnum
    FROM public.daily_logs
  ) t
  WHERE t.rnum > 1
);

-- B. Explicitly Drop Constraints (and potential indices)
-- Try dropping by likely names to ensure slate is clean
ALTER TABLE public.daily_logs DROP CONSTRAINT IF EXISTS daily_logs_client_id_log_date_key;
DROP INDEX IF EXISTS daily_logs_client_id_log_date_key; -- Just in case it exists as index only

-- C. Re-Add Constraint
ALTER TABLE public.daily_logs 
  ADD CONSTRAINT daily_logs_client_id_log_date_key UNIQUE (client_id, log_date);

-- ----------------------------------------------------------------------------
-- 3. USER ACHIEVEMENTS: Fix Constraints
-- ----------------------------------------------------------------------------

-- A. Clean duplicates
DELETE FROM public.user_achievements
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, achievement_id ORDER BY current_value DESC, updated_at DESC) as rnum
    FROM public.user_achievements
  ) t
  WHERE t.rnum > 1
);

-- B. Explicitly Drop Constraints
ALTER TABLE public.user_achievements DROP CONSTRAINT IF EXISTS user_achievements_user_id_achievement_id_key;
ALTER TABLE public.user_achievements DROP CONSTRAINT IF EXISTS user_achievements_unique_key; -- In case we named it this before
DROP INDEX IF EXISTS user_achievements_user_id_achievement_id_key;

-- C. Re-Add Constraint
ALTER TABLE public.user_achievements 
  ADD CONSTRAINT user_achievements_user_id_achievement_id_key UNIQUE (user_id, achievement_id);

-- ----------------------------------------------------------------------------
-- 4. RECREATE FUNCTIONS with ON CONFLICT ON CONSTRAINT
-- ----------------------------------------------------------------------------

-- A. check_user_achievements
CREATE OR REPLACE FUNCTION public.check_user_achievements(
  _user_id uuid,
  _category text,
  _value integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _achievement record;
BEGIN
  FOR _achievement IN
    SELECT * FROM public.achievements WHERE category = _category
  LOOP
    INSERT INTO public.user_achievements (user_id, achievement_id, current_value)
    VALUES (_user_id, _achievement.id, _value)
    -- EXPLICIT CONSTRAINT REFERENCE
    ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key 
    DO UPDATE
    SET current_value = GREATEST(EXCLUDED.current_value, user_achievements.current_value),
        updated_at = now();
    
    -- Check unlock status
    IF _value >= _achievement.target_value THEN
       UPDATE public.user_achievements
       SET is_unlocked = true, unlocked_at = now()
       WHERE user_id = _user_id 
       AND achievement_id = _achievement.id
       AND is_unlocked = false;
    END IF;
  END LOOP;
END;
$$;

-- B. handle_daily_log_stats (Trigger Function)
CREATE OR REPLACE FUNCTION public.handle_daily_log_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _user_id uuid;
  _total_activity integer;
BEGIN
  -- Safe ID lookup with paranoid casting
  SELECT user_id INTO _user_id 
  FROM public.clients 
  WHERE id::text = NEW.client_id::text;

  IF _user_id IS NULL THEN RETURN NEW; END IF;

  -- 1. Activity Total
  SELECT COALESCE(SUM(activity_minutes), 0) INTO _total_activity
  FROM public.daily_logs
  WHERE client_id::text = NEW.client_id::text;
  
  PERFORM public.check_user_achievements(_user_id, 'activity', _total_activity);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_daily_log_change
  AFTER INSERT OR UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_daily_log_stats();

-- C. log_daily_metric
CREATE OR REPLACE FUNCTION public.log_daily_metric(
  p_client_id uuid,
  p_metric_type text,
  p_value numeric,
  p_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_daily_log_id uuid;
  v_new_data record;
BEGIN
  -- 1. Authorization Check
  SELECT user_id INTO v_user_id
  FROM public.clients
  WHERE id::text = p_client_id::text;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF v_user_id::text != auth.uid()::text AND NOT public.is_admin() THEN
     RAISE EXCEPTION 'Access denied';
  END IF;

  -- 2. Upsert Daily Log
  INSERT INTO public.daily_logs (client_id, log_date)
  VALUES (p_client_id, p_date)
  -- EXPLICIT CONSTRAINT REFERENCE
  ON CONFLICT ON CONSTRAINT daily_logs_client_id_log_date_key 
  DO NOTHING;

  -- Get the ID
  SELECT id INTO v_daily_log_id
  FROM public.daily_logs
  WHERE client_id::text = p_client_id::text
    AND log_date = p_date;

  -- 3. Update Metric
  IF p_metric_type = 'water' THEN
    UPDATE public.daily_logs
    SET water_intake = COALESCE(water_intake, 0) + p_value
    WHERE id = v_daily_log_id
    RETURNING * INTO v_new_data;
    
  ELSIF p_metric_type = 'activity' THEN
    UPDATE public.daily_logs
    SET activity_minutes = COALESCE(activity_minutes, 0) + p_value
    WHERE id = v_daily_log_id
    RETURNING * INTO v_new_data;
    
  ELSIF p_metric_type = 'weight' THEN
    UPDATE public.daily_logs
    SET weight = p_value
    WHERE id = v_daily_log_id
    RETURNING * INTO v_new_data;

    UPDATE public.clients
    SET last_weight = p_value
    WHERE id::text = p_client_id::text;
    
  ELSE
    RAISE EXCEPTION 'Invalid metric type: %', p_metric_type;
  END IF;

  RETURN row_to_json(v_new_data);
END;
$$;
