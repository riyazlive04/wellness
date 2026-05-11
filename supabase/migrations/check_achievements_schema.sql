-- check_achievements_schema.sql
-- 1. Check Columns for user_achievements and achievements
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('user_achievements', 'achievements');

-- 2. Check Policies (RLS) for user_achievements
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'user_achievements';
