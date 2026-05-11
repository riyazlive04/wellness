-- check_meal_logs_details.sql
-- 1. Check meal_logs columns
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'meal_logs';

-- 2. Check IS_OWN_CLIENT arguments
SELECT routine_name, data_type, parameter_name, parameter_mode
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND specific_name LIKE 'is_own_client%';
