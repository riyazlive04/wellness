-- Create admin_requests table for handling user requests (like meal updates)
CREATE TABLE public.admin_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL, -- Match clients.id type (text)
  request_type text NOT NULL, -- e.g., 'meal_update'
  status text DEFAULT 'pending' NOT NULL, -- 'pending', 'resolved', 'dismissed'
  metadata jsonb DEFAULT '{}'::jsonb, -- e.g., { "meal_id": "...", "reason": "Wrong photo" }
  admin_notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger
CREATE TRIGGER update_admin_requests_modtime
    BEFORE UPDATE ON public.admin_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies

-- 1. Clients can INSERT their own requests
CREATE POLICY "Clients can create requests"
ON public.admin_requests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = admin_requests.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);

-- 2. Clients can VIEW their own requests (optional, but good for UI state)
CREATE POLICY "Clients can view own requests"
ON public.admin_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = admin_requests.client_id
    AND clients.user_id::text = auth.uid()::text
  )
);

-- 3. Admins can VIEW all requests
CREATE POLICY "Admins can view all requests"
ON public.admin_requests
FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

-- 4. Admins can UPDATE requests (to mark resolve)
CREATE POLICY "Admins can update requests"
ON public.admin_requests
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
);

-- 5. Admins can DELETE requests
CREATE POLICY "Admins can delete requests"
ON public.admin_requests
FOR DELETE
TO authenticated
USING (
  public.is_admin()
);
