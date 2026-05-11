-- ============================================================================
-- FIX: "Operator does not exist: text = uuid" in check_user_achievements
-- ============================================================================
-- The error prevents adding water/activity because the trigger calls this function.
-- The likely cause is that 'user_achievements.user_id' or 'achievement_id' is TEXT,
-- but we are comparing it to UUID variables (or vice versa) without casting.

-- FIX: We rewrite the function to cast BOTH SIDES to TEXT for every comparison.
-- This guarantees it works regardless of the underlying column types.

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
  -- Iterate through achievements for this category
  FOR _achievement IN
    SELECT * FROM public.achievements WHERE category = _category
  LOOP
    -- 1. Upsert Progress
    INSERT INTO public.user_achievements (user_id, achievement_id, current_value)
    VALUES (_user_id, _achievement.id, _value)
    ON CONFLICT ON CONSTRAINT user_achievements_user_id_achievement_id_key 
    DO UPDATE
    SET current_value = GREATEST(EXCLUDED.current_value, user_achievements.current_value),
        updated_at = now();
    
    -- 2. Check Unlock Status (PARANOID CASTING HERE)
    IF _value >= _achievement.target_value THEN
       UPDATE public.user_achievements
       SET is_unlocked = true, unlocked_at = now()
       WHERE user_id::text = _user_id::text              -- Cast both signals
       AND achievement_id::text = _achievement.id::text  -- Cast both signals
       AND is_unlocked = false;
    END IF;
  END LOOP;
END;
$$;
