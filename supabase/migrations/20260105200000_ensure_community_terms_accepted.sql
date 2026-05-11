-- Ensure community_terms_accepted_at exists
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS community_terms_accepted_at timestamp with time zone;

-- Ensure RLS allows users to update this specific column (covered by general update policy, but good to verify)
-- No specific column grant needed if table grant exists, which it should.
