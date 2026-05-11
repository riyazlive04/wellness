-- Create a private bucket for meal photos
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

-- RLS Policy: Allow authenticated users to upload their own meal photos
create policy "Authenticated users can upload meal photos"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1] );

-- RLS Policy: Allow authenticated users to view their own meal photos
create policy "Authenticated users can view meal photos"
on storage.objects for select
to authenticated
using ( bucket_id = 'meal-photos' );
