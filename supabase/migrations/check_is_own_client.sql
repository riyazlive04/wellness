-- check_is_own_client.sql
SELECT routines.routine_name, routines.routine_definition
FROM information_schema.routines
WHERE routines.routine_schema = 'public' 
  AND routines.routine_name = 'is_own_client';
