-- check_daily_logs_type.sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'daily_logs'
  AND column_name = 'client_id';
