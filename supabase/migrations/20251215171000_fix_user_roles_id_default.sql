-- Fix missing default value for user_roles.id
-- This prevents "null value in column id" errors when inserting without an explicit ID.

ALTER TABLE public.user_roles 
ALTER COLUMN id SET DEFAULT gen_random_uuid();
