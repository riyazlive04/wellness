-- Add columns to meal_cards for better tracking
ALTER TABLE public.meal_cards 
ADD COLUMN IF NOT EXISTS source_id UUID,
ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('food_item', 'ingredient', 'recipe')),
ADD COLUMN IF NOT EXISTS quantity DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS unit TEXT;

-- Add same columns to meal_logs for better tracking
ALTER TABLE public.meal_logs
ADD COLUMN IF NOT EXISTS source_id UUID,
ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('food_item', 'ingredient', 'recipe')),
ADD COLUMN IF NOT EXISTS quantity DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS unit TEXT;

-- Update RLS policies (optional, usually inherited if they specify FOR ALL)
-- Existing policies use public.has_role(auth.uid(), 'admin') which covers management.
