-- check_diagnostics.sql
-- 1. Check Columns
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('daily_logs', 'clients')
  AND column_name IN ('id', 'client_id', 'user_id');

-- 2. Check Policies (RLS)
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'daily_logs';

-- 3. Check Triggers
SELECT event_object_table, trigger_name, action_statement, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'daily_logs';
