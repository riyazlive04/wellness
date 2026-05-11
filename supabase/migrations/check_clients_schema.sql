-- check_clients_schema.sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'clients'
  AND column_name IN ('id', 'user_id');
