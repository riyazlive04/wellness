-- check_achievements_id.sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'achievements'
  AND column_name = 'id';
