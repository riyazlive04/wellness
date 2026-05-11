-- Fix for "null value in column id violates not-null constraint"
-- It appears the ID column lost its default value generation.

ALTER TABLE public.messages 
ALTER COLUMN id SET DEFAULT gen_random_uuid();
