-- Fix for "operator does not exist: text = uuid" error
-- This script updates RLS policies and Trigger functions to be strictly typed.

-- 1. Update RLS on user_achievements to handle auth.uid() safely
DROP POLICY IF EXISTS "Users can view own achievements" ON public.user_achievements;
CREATE POLICY "Users can view own achievements"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (user_id::text = auth.uid()::text);

-- 2. Update RLS on daily_logs (Just in case)
DROP POLICY IF EXISTS "Clients can insert their own logs" ON public.daily_logs;
CREATE POLICY "Clients can insert their own logs"
  ON public.daily_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id::text = daily_logs.client_id::text
      AND clients.user_id::text = auth.uid()::text
    )
  );

-- 3. Recreate check_user_achievements with strict typing
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
  _current_progress integer;
BEGIN
  -- Loop through all achievements in the category
  FOR _achievement IN
    SELECT * FROM public.achievements WHERE category = _category
  LOOP
    -- Get or initialize user progress
    INSERT INTO public.user_achievements (user_id, achievement_id, current_value)
    VALUES (_user_id, _achievement.id, _value)
    ON CONFLICT (user_id, achievement_id) DO UPDATE
    SET current_value = CASE
      WHEN EXCLUDED.current_value > user_achievements.current_value THEN EXCLUDED.current_value
      ELSE user_achievements.current_value
    END,
    updated_at = now()
    RETURNING is_unlocked INTO _achievement;
    
    -- Check if we should unlock
    -- Re-fetch to be safe
    SELECT is_unlocked INTO _achievement FROM public.user_achievements 
    WHERE user_id::text = _user_id::text AND achievement_id::text = _achievement.id::text;

    IF NOT _achievement.is_unlocked THEN
      -- Check condition
      IF _value >= _achievement.target_value THEN
        UPDATE public.user_achievements
        SET is_unlocked = true, unlocked_at = now()
        WHERE user_id::text = _user_id::text AND achievement_id::text = _achievement.id::text;
      END IF;
    END IF;
  END LOOP;
END;
$$;
