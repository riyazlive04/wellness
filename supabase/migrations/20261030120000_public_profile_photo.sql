-- A practitioner's photo for their public link-in-bio page.
--
-- The page's job is persuading a stranger from an Instagram bio to book, and
-- people book a person rather than a logo. Every other field on this table is
-- words; this is the one that shows who they would actually be talking to.
--
-- Separate from workspaces.logo_url on purpose. A logo is the practice's mark
-- and belongs on invoices, reports and the app chrome; this is a face, used in
-- one place. A practice with a logo and no photo, or a photo and no logo, are
-- both ordinary - so neither can stand in for the other.
--
-- Nullable, because most practices will not upload one and the page has to
-- read well without it: the layout falls back to the logo, and then to the
-- practice initial.
ALTER TABLE public.workspace_public_profiles
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.workspace_public_profiles.photo_url IS
  'Practitioner photo shown on the public page. A URL, like workspaces.logo_url. Null → the page falls back to the practice logo.';
