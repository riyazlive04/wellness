-- Add activity_type column to daily_logs table
ALTER TABLE public.daily_logs 
ADD COLUMN IF NOT EXISTS activity_type text;
