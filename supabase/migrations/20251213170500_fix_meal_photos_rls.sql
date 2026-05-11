-- Drop incorrect policies
drop policy if exists "Authenticated users can upload meal photos" on storage.objects;
drop policy if exists "Authenticated users can view meal photos" on storage.objects;

-- RLS Policy: Allow authenticated users to upload their own meal photos (folder name = client_id)
create policy "Authenticated users can upload meal photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'meal-photos' and
  exists (
    select 1 from public.clients
    where id::text = (storage.foldername(name))[1]
    and user_id::text = auth.uid()::text
  )
);

-- RLS Policy: Allow authenticated users to view their own meal photos
create policy "Authenticated users can view meal photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'meal-photos' and
  exists (
    select 1 from public.clients
    where id::text = (storage.foldername(name))[1]
    and user_id::text = auth.uid()::text
  )
);
