-- Fix bug where loop variable _achievement was being overwritten, causing "record has no field id" error

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
  _user_achievement_status boolean; -- New variable to hold status
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
    RETURNING is_unlocked INTO _user_achievement_status; -- Store result in separate variable
    
    -- Check if we should unlock
    -- If NOT already unlocked
    IF NOT _user_achievement_status THEN
      -- Check condition based on the definition in the loop variable _achievement
      IF _value >= _achievement.target_value THEN
        UPDATE public.user_achievements
        SET is_unlocked = true, unlocked_at = now()
        WHERE user_id = _user_id AND achievement_id = _achievement.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;
