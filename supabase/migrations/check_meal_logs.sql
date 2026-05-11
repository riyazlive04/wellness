-- check_meal_logs.sql
-- 1. Check Columns
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'meal_logs';

-- 2. Check Policies
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'meal_logs';
