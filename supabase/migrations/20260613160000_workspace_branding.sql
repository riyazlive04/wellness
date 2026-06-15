-- Real workspace branding (Phase 1).
--
-- workspaces already has logo_url + brand_color. This adds the remaining
-- branding fields so the practice's colours, tagline, and white-label flag
-- persist server-side and reach every client on every device (replacing the
-- localStorage-only mock).
--   brand_color  -> primary brand colour (already present)
--   brand_accent -> secondary/accent colour (new)
--   tagline      -> shown on the client portal (new)
--   white_label  -> Enterprise: hide SIRAH branding (new)

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS brand_accent text,
  ADD COLUMN IF NOT EXISTS tagline      text,
  ADD COLUMN IF NOT EXISTS white_label  boolean NOT NULL DEFAULT false;
