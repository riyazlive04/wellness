-- Fix 'files' table id column not having a default value
ALTER TABLE public.files
ALTER COLUMN id SET DEFAULT gen_random_uuid();
