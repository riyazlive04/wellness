-- Program module enrichment (program.md). Additive + idempotent.
-- First-class columns are the ones we filter/enforce/show on cards; the rest of
-- the rich, client-facing structure lives in `content` JSONB. `internal_notes`
-- is a SEPARATE column kept out of `content` so client queries cannot leak it.

ALTER TABLE public.program_templates
  ADD COLUMN IF NOT EXISTS tagline          text,
  ADD COLUMN IF NOT EXISTS cover_image_url   text,
  ADD COLUMN IF NOT EXISTS difficulty        text    NOT NULL DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS featured          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_enrollment  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_enrollments   integer,
  ADD COLUMN IF NOT EXISTS internal_notes    text,
  ADD COLUMN IF NOT EXISTS content           jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- content shape (all optional, client-safe):
-- {
--   "overview":     { "purpose": "", "achieve": "", "benefits": [], "transformation": "" },
--   "audience":     { "tags": [], "min_age": null, "max_age": null, "bmi_min": null, "bmi_max": null },
--   "eligibility":  { "conditions_allowed": [], "conditions_not_suitable": [],
--                     "pregnancy_restriction": false, "doctor_approval": false, "prerequisites": [] },
--   "outcomes":     { "weight_loss": "", "waist": "", "body_fat": "",
--                     "energy": false, "sleep": false, "habits": false, "disclaimer": "" },
--   "roadmap":      [ { "title": "", "description": "", "duration": "" } ],
--   "deliverables": [],
--   "support":      []
--   "faqs":         [ { "q": "", "a": "" } ]
-- }
