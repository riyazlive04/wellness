-- Fix missing default value for id column in food_items table
ALTER TABLE public.food_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
