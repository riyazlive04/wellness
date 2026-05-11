-- Ensure constraint and default value for id column in assessment_requests
DO $$
BEGIN
    -- Check if the table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'assessment_requests') THEN
        -- Alter the column to ensure it has the default value
        ALTER TABLE public.assessment_requests ALTER COLUMN id SET DEFAULT gen_random_uuid();
        
        -- Optional: explicit not null constraint (it likely already has it, but good to ensure)
        ALTER TABLE public.assessment_requests ALTER COLUMN id SET NOT NULL;
    END IF;
END $$;
