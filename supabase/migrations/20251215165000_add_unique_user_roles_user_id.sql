-- Ensure user_id in user_roles table is unique
-- This is required for data integrity (one role per user) and for potential future upserts.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'user_roles_user_id_key' 
        AND conrelid = 'public.user_roles'::regclass
    ) THEN
        -- Try to delete duplicates if any exist (keeping the most recent or arbitrary one)
        -- Since we don't have a reliable timestamp in user_roles usually, we just keep one.
        -- Assuming user_roles has an ID column? If not, we use CTID.
        
        -- Delete duplicates keeping one
        DELETE FROM public.user_roles a USING public.user_roles b
        WHERE a.ctid < b.ctid AND a.user_id = b.user_id;

        -- Add the constraint
        ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
    END IF;
END $$;
