-- Create admin_notes table for internal user notes
-- V2: Changed client_id to TEXT to match public.clients.id type in live DB

CREATE TABLE public.admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL, -- Changed to TEXT
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, 
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger
CREATE TRIGGER update_admin_notes_modtime
    BEFORE UPDATE ON public.admin_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies

-- 1. Admins can SELECT all notes
CREATE POLICY "Admins can view admin_notes"
ON public.admin_notes
FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

-- 2. Admins can INSERT notes
CREATE POLICY "Admins can insert admin_notes"
ON public.admin_notes
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
);

-- 3. Admins can UPDATE notes
CREATE POLICY "Admins can update admin_notes"
ON public.admin_notes
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
);

-- 4. Admins can DELETE notes
CREATE POLICY "Admins can delete admin_notes"
ON public.admin_notes
FOR DELETE
TO authenticated
USING (
  public.is_admin()
);
