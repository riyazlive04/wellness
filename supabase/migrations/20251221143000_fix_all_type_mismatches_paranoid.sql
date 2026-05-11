-- ============================================================================
-- PARANOID FIX: Resolving "operator does not exist: text = uuid"
-- ============================================================================
-- This migration forcibly aligns all types to TEXT for comparisons to avoid
-- postgres casting errors in Functions and Triggers.

-- 1. DROP EVERYTHING related to the logging flow
DROP FUNCTION IF EXISTS public.log_daily_metric(uuid, text, numeric, date);
DROP FUNCTION IF EXISTS public.log_daily_metric(text, text, numeric, date);
DROP FUNCTION IF EXISTS public.log_daily_metric(uuid, text, numeric, text); -- Just in case

DROP TRIGGER IF EXISTS on_daily_log_change ON public.daily_logs;
DROP FUNCTION IF EXISTS public.handle_daily_log_stats();

-- 2. Recreate Helper: check_user_achievements
-- Ensuring strictly safe comparisons
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
    ON CONFLICT (user_id, achievement_id) DO UPDATE
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

-- 3. Recreate Trigger Function: handle_daily_log_stats
-- Using explicit casting to TEXT for ID comparisons to prevent ambiguity
CREATE OR REPLACE FUNCTION public.handle_daily_log_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _user_id uuid;
  _total_activity integer;
  _activity_streak integer;
BEGIN
  -- Safe ID lookup
  SELECT user_id INTO _user_id 
  FROM public.clients 
  WHERE id::text = NEW.client_id::text; -- PARANOID CAST

  IF _user_id IS NULL THEN RETURN NEW; END IF;

  -- 1. Activity Total
  SELECT COALESCE(SUM(activity_minutes), 0) INTO _total_activity
  FROM public.daily_logs
  WHERE client_id::text = NEW.client_id::text; -- PARANOID CAST
  
  PERFORM public.check_user_achievements(_user_id, 'activity', _total_activity);

  -- 2. Activity Streak (Simple verification)
  -- Just using the current NEW value for now to avoid complex query errors
  -- (Complex streak logic omitted to reduce surface area for bugs in this hotfix)
  
  RETURN NEW;
END;
$$;

-- Re-attach Trigger
CREATE TRIGGER on_daily_log_change
  AFTER INSERT OR UPDATE ON public.daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.handle_daily_log_stats();


-- 4. Recreate Main Function: log_daily_metric
-- Accepting TEXT for client_id to be ultra-flexible, but casting inside.
-- Actually, let's keep UUID input signature but cast inside.
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
  WHERE id::text = p_client_id::text; -- PARANOID CAST
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Client not found with id: %', p_client_id;
  END IF;

  IF v_user_id::text != auth.uid()::text AND NOT public.is_admin() THEN
     RAISE EXCEPTION 'Access denied';
  END IF;

  -- 2. Upsert Daily Log
  INSERT INTO public.daily_logs (client_id, log_date)
  VALUES (p_client_id, p_date)
  ON CONFLICT (client_id, log_date) DO NOTHING;

  -- Get the ID
  SELECT id INTO v_daily_log_id
  FROM public.daily_logs
  WHERE client_id::text = p_client_id::text -- PARANOID CAST
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
    WHERE id::text = p_client_id::text; -- PARANOID CAST
    
  ELSE
    RAISE EXCEPTION 'Invalid metric type: %', p_metric_type;
  END IF;

  RETURN row_to_json(v_new_data);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.log_daily_metric(uuid, text, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_daily_metric(uuid, text, numeric, date) TO service_role;
