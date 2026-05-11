-- Ensure user_id in clients table is unique
-- This is required for data integrity (one client per user) and for potential future upserts.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'clients_user_id_key' 
        AND conrelid = 'public.clients'::regclass
    ) THEN
        -- Try to delete duplicates if any exist (keeping the most recent)
        DELETE FROM public.clients a USING public.clients b
        WHERE a.id < b.id AND a.user_id = b.user_id;

        -- Add the constraint
        ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_key UNIQUE (user_id);
    END IF;
END $$;
