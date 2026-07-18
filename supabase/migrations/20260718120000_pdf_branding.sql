-- ============================================================================
-- SIRAH LIFE — Per-workspace PDF template customization.
--
-- Every PDF export (meal plans, reports, food library, invoices) already had a
-- hardcoded SIRAH header. These two fields, together with the existing
-- logo_url / brand_color / brand_accent / tagline / white_label, let each
-- workspace brand its own documents.
--
--   pdf_contact_line -> optional header contact line (phone · email · web).
--                       When NULL, PDFs compose one from contact_email/phone.
--   pdf_footer_note  -> optional footer note / disclaimer under the page number.
-- ============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS pdf_contact_line text,
  ADD COLUMN IF NOT EXISTS pdf_footer_note  text;

COMMENT ON COLUMN public.workspaces.pdf_contact_line IS
  'Optional contact line printed in PDF headers. NULL = compose from contact_email/contact_phone.';
COMMENT ON COLUMN public.workspaces.pdf_footer_note IS
  'Optional note/disclaimer printed in the PDF footer, above the page number.';
