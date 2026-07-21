-- Storage bucket for product photos, so an owner can upload from their phone or
-- laptop instead of pasting a URL.
--
-- PUBLIC, unlike every other bucket in this project. Those hold client health
-- data and are private + signed-URL only. A product photo is marketing material
-- shown to every client in the storefront, and signed URLs expire — which would
-- silently blank out shop images. Public read is the correct trade here; nothing
-- private is ever put in this bucket.
--
-- Path convention: {workspace_id}/{timestamp}.{ext} — the leading folder is what
-- the write policies below check, so one workspace can't overwrite another's
-- images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "Anyone can view product images" on storage.objects;

create policy "Anyone can view product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Workspace staff can upload product images" on storage.objects;

create policy "Workspace staff can upload product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.workspace_members wm
       where wm.user_id = auth.uid()
         and wm.status = 'active'
         and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Workspace staff can update product images" on storage.objects;

create policy "Workspace staff can update product images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.workspace_members wm
       where wm.user_id = auth.uid()
         and wm.status = 'active'
         and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Workspace staff can delete product images" on storage.objects;

create policy "Workspace staff can delete product images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.workspace_members wm
       where wm.user_id = auth.uid()
         and wm.status = 'active'
         and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );
