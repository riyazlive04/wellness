-- check_schema.sql
-- Inspect columns
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('daily_logs', 'user_achievements')
  AND column_name IN ('client_id', 'user_id', 'achievement_id', 'log_date');

-- Inspect constraints
SELECT conname, pg_get_constraintdef(oid) as def
FROM pg_constraint
WHERE conrelid IN ('public.daily_logs'::regclass, 'public.user_achievements'::regclass);
