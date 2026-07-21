-- Fix: product-image uploads failed with
--   {"error":"DatabaseInvalidObjectDefinition","message":"The database schema
--    is invalid or incompatible."}
--
-- The previous policies queried public.workspace_members directly. Storage
-- evaluates storage.objects policies as supabase_storage_admin, which has no
-- privileges on that table, so the policy body failed to execute at all.
--
-- Every pre-existing storage policy in this project goes through a SECURITY
-- DEFINER helper (is_own_client, is_admin, has_role) for exactly this reason.
-- This adds the equivalent helper and rewrites the policies to use it.

create or replace function public.is_workspace_folder_member(folder text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.workspace_members wm
     where wm.user_id = auth.uid()
       and wm.status = 'active'
       and wm.workspace_id::text = folder
  )
$$;

grant execute on function public.is_workspace_folder_member(text) to authenticated;

drop policy if exists "Workspace staff can upload product images" on storage.objects;

create policy "Workspace staff can upload product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.is_workspace_folder_member((storage.foldername(name))[1])
  );

drop policy if exists "Workspace staff can update product images" on storage.objects;

create policy "Workspace staff can update product images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_workspace_folder_member((storage.foldername(name))[1])
  );

drop policy if exists "Workspace staff can delete product images" on storage.objects;

create policy "Workspace staff can delete product images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_workspace_folder_member((storage.foldername(name))[1])
  );
