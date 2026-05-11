-- check_storage_policies.sql
-- 1. Check policies on storage.objects
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage';

-- 2. Check buckets
SELECT id, name, public 
FROM storage.buckets;
