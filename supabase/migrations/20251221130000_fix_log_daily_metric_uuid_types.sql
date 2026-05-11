-- ============================================================================
-- CRITICAL FIX: Override log_daily_metric with correct UUID types
-- ============================================================================
-- This migration fixes the TEXT vs UUID type mismatch bug
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/ljxgaycjomnyfihdsgke/sql
-- ============================================================================

-- Drop any existing versions
DROP FUNCTION IF EXISTS public.log_daily_metric(uuid, text, numeric, date) CASCADE;

-- Recreate with CORRECT UUID types (not TEXT!)
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
  v_user_id uuid; -- CORRECT TYPE: UUID (not TEXT!)
  v_daily_log_id uuid;
  v_new_data record;
BEGIN
  -- 1. Authorization Check
  -- Get the user_id associated with the client
  SELECT user_id INTO v_user_id
  FROM public.clients
  WHERE id = p_client_id;
  
  -- If no client found, raise exception
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Client not found with id: %', p_client_id;
  END IF;

  -- UUID to UUID comparison (NO text casting!)
  IF v_user_id != auth.uid() THEN
      -- If not the owner, check if admin
      IF NOT public.is_admin() THEN
         RAISE EXCEPTION 'Access denied';
      END IF;
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

-- Verify the fix
DO $$
BEGIN
  RAISE NOTICE '✅ log_daily_metric function updated with correct UUID types!';
  RAISE NOTICE '✅ The TEXT vs UUID bug has been fixed.';
END $$;
