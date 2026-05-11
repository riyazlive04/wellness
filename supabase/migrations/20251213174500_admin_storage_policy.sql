-- Allow Admins to view all files in the meal-photos bucket
create policy "Admins can view all meal photos"
on storage.objects for select
using (
  bucket_id = 'meal-photos'
  and exists (
    select 1 from public.user_roles
    where user_id::text = auth.uid()::text
    and role::text = 'admin'
  )
);
