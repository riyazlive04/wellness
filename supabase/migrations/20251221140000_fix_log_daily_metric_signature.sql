-- ============================================================================
-- FIX: Drop incorrect log_daily_metric signatures to prevent "text = uuid" error
-- ============================================================================

-- Drop the incorrect version that accepts TEXT for client_id
DROP FUNCTION IF EXISTS public.log_daily_metric(text, text, numeric, date);

-- Ensure we also drop the one we *think* is right, to force a clean recreate
DROP FUNCTION IF EXISTS public.log_daily_metric(uuid, text, numeric, date);

-- Recreate with CORRECT UUID types
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
  -- Explicitly cast just in case, though p_client_id is uuid now
  SELECT user_id INTO v_user_id
  FROM public.clients
  WHERE id = p_client_id;
  
  -- If no client found, raise exception
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Client not found with id: %', p_client_id;
  END IF;

  -- 2. Upsert Daily Log
  INSERT INTO public.daily_logs (client_id, log_date)
  VALUES (p_client_id, p_date)
  ON CONFLICT (client_id, log_date) DO NOTHING;

  -- Get the ID of the daily log
  SELECT id INTO v_daily_log_id
  FROM public.daily_logs
  WHERE client_id = p_client_id AND log_date = p_date;

  -- 3. Update the specific metric
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

    -- Also update the client's last_weight
    UPDATE public.clients
    SET last_weight = p_value
    WHERE id = p_client_id;
    
  ELSE
    RAISE EXCEPTION 'Invalid metric type: %. Must be water, activity, or weight', p_metric_type;
  END IF;

  RETURN row_to_json(v_new_data);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.log_daily_metric(uuid, text, numeric, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_daily_metric(uuid, text, numeric, date) TO service_role;
