-- check_deep_scan.sql
-- 1. Dump Function Definitions
SELECT routines.routine_name, routines.routine_definition
FROM information_schema.routines
WHERE routines.routine_schema = 'public' 
  AND routines.routine_name IN ('handle_daily_log_stats', 'check_user_achievements');

-- 2. Check Triggers on user_achievements
SELECT event_object_table, trigger_name, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'user_achievements';

-- 3. Check daily_logs.id type
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'daily_logs' AND column_name = 'id';
