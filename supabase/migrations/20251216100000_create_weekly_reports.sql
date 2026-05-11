-- Handle existing weekly_reports table or create new
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weekly_reports') THEN
        -- Table exists, let's alter it to match our new schema
        -- We will keep existing columns if possible, but add new ones
        -- Actually, for clean slate, we might want to drop incompatible columns or make them nullable
        
        -- Add new columns if they don't exist
        ALTER TABLE public.weekly_reports ADD COLUMN IF NOT EXISTS report_date DATE DEFAULT CURRENT_DATE;
        ALTER TABLE public.weekly_reports ADD COLUMN IF NOT EXISTS content TEXT;
        ALTER TABLE public.weekly_reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
        ALTER TABLE public.weekly_reports ADD COLUMN IF NOT EXISTS admin_id UUID DEFAULT auth.uid();

        -- Make old columns nullable if they are required (optional, based on lint error they seemed required)
        ALTER TABLE public.weekly_reports ALTER COLUMN week_number DROP NOT NULL;
        ALTER TABLE public.weekly_reports ALTER COLUMN start_date DROP NOT NULL;
        ALTER TABLE public.weekly_reports ALTER COLUMN end_date DROP NOT NULL;
        
    ELSE
        -- Table does not exist, create it
        CREATE TABLE public.weekly_reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
            admin_id UUID DEFAULT auth.uid(),
            report_date DATE NOT NULL DEFAULT CURRENT_DATE,
            summary TEXT,
            content TEXT,
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_weekly_reports_client_id ON public.weekly_reports(client_id);
        CREATE INDEX IF NOT EXISTS idx_weekly_reports_status ON public.weekly_reports(status);
    END IF;
END $$;

-- Enable RLS (idempotent)
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them safely
DROP POLICY IF EXISTS "Admins can do everything with monthly reports" ON public.weekly_reports;
DROP POLICY IF EXISTS "Clients can view their own published reports" ON public.weekly_reports;
DROP POLICY IF EXISTS "Admins can do everything with weekly reports" ON public.weekly_reports;

-- Policy for Admins: Full Access
CREATE POLICY "Admins can do everything with weekly reports"
ON public.weekly_reports
FOR ALL
USING (
    public.is_admin()
);

-- Policy for Clients: View Only Published Reports belonging to them
CREATE POLICY "Clients can view their own published reports"
ON public.weekly_reports
FOR SELECT
USING (
    auth.uid()::text IN (SELECT user_id::text FROM public.clients WHERE id::text = weekly_reports.client_id::text)
    AND status = 'published'
);
