-- Fix missing default value for meal_logs.id
-- The frontend does not provide an ID, so the database must generate one.

ALTER TABLE public.meal_logs 
ALTER COLUMN id SET DEFAULT gen_random_uuid();
