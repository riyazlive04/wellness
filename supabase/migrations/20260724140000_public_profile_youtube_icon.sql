-- Allow youtube as a public-profile link icon.
ALTER TABLE public.workspace_profile_links
  DROP CONSTRAINT IF EXISTS workspace_profile_links_icon_chk;

ALTER TABLE public.workspace_profile_links
  ADD CONSTRAINT workspace_profile_links_icon_chk
  CHECK (icon IN ('whatsapp', 'instagram', 'youtube', 'website', 'calendar', 'shop', 'custom'));
