-- Fix missing default UUID generation on weekly_reports.id column
-- This ensures new reports can be inserted without specifying id explicitly

ALTER TABLE public.weekly_reports 
ALTER COLUMN id SET DEFAULT gen_random_uuid();
