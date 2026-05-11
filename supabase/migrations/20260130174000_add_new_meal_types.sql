-- Add new meal types to the meal_type enum
-- Adding: early_morning, mid_breakfast, evening_snack_1, evening_snack_2

-- Step 1: Add new values to the enum
ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'early_morning';
ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'mid_breakfast';
ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'evening_snack_1';
ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'evening_snack_2';

-- Note: The existing values are: breakfast, lunch, evening_snack, dinner
-- After this migration, the complete list will be:
-- early_morning, breakfast, mid_breakfast, lunch, evening_snack, evening_snack_1, evening_snack_2, dinner
