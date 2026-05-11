-- Add cleansing_water to the meal_type enum
ALTER TYPE public.meal_type ADD VALUE IF NOT EXISTS 'cleansing_water';

-- Note: We are keeping 'evening_snack' in the enum to avoid breaking existing data, 
-- but we will remove it from the UI options.
