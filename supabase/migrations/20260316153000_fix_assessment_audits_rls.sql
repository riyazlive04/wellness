-- Migration: Robust Fix for Assessment Audits Type Mismatch and RLS
-- Description: Drops existing constraints, adapts actor_id type, and restores relationship.

DO $$ 
DECLARE
    profile_id_type text;
    constraint_name_found text;
BEGIN 
    -- 1. Identify existing foreign key on assessment_audits.actor_id
    SELECT tc.constraint_name INTO constraint_name_found
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name = 'assessment_audits'
      AND kcu.column_name = 'actor_id';

    IF constraint_name_found IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.assessment_audits DROP CONSTRAINT ' || constraint_name_found;
    END IF;

    -- 2. Determine the actual type of public.profiles.id
    SELECT data_type INTO profile_id_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'id';

    -- 3. Adapt actor_id to match profiles.id
    IF profile_id_type = 'text' THEN
        ALTER TABLE public.assessment_audits ALTER COLUMN actor_id TYPE text;
    ELSE
        ALTER TABLE public.assessment_audits ALTER COLUMN actor_id TYPE uuid USING actor_id::uuid;
    END IF;

    -- 4. Re-add the correct foreign key constraint to profiles
    ALTER TABLE public.assessment_audits 
    ADD CONSTRAINT assessment_audits_actor_id_fkey_profiles 
    FOREIGN KEY (actor_id) REFERENCES public.profiles(id);

EXCEPTION WHEN others THEN
    RAISE NOTICE 'An error occurred during migration: %', SQLERRM;
END $$;

-- 5. Ensure RLS is enabled
ALTER TABLE public.assessment_audits ENABLE ROW LEVEL SECURITY;

-- 6. Re-create RLS Policies
DROP POLICY IF EXISTS "Admins and Managers can view audits" ON public.assessment_audits;
DROP POLICY IF EXISTS "Admins and Managers can insert audits" ON public.assessment_audits;

CREATE POLICY "Admins and Managers can view audits"
ON public.assessment_audits
FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'manager')
  )
);

CREATE POLICY "Admins and Managers can insert audits"
ON public.assessment_audits
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'manager')
  )
);

-- 7. Refresh schema cache hint
COMMENT ON TABLE public.assessment_audits IS 'Audits for assessment changes. Fixed types and RLS on 2026-03-16.';
