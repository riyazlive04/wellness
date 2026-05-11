-- Add steps tracking to daily_logs table
ALTER TABLE public.daily_logs 
ADD COLUMN IF NOT EXISTS steps INTEGER DEFAULT 0;