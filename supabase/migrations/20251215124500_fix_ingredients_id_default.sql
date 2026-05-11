-- Fix missing default value for id column in ingredients table
ALTER TABLE public.ingredients ALTER COLUMN id SET DEFAULT gen_random_uuid();
