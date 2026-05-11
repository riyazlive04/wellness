-- Create storage buckets for file management
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('assessment-files', 'assessment-files', false),
  ('meal-photos', 'meal-photos', false),
  ('client-files', 'client-files', false),
  ('weekly-plan-pdfs', 'weekly-plan-pdfs', false);

-- RLS policies for assessment-files bucket
CREATE POLICY "Admins can upload assessment files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'assessment-files' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view all assessment files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'assessment-files' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Clients can view their assessment files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'assessment-files' AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  )
);

CREATE POLICY "Admins can delete assessment files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'assessment-files' AND
  has_role(auth.uid(), 'admin'::app_role)
);

-- RLS policies for meal-photos bucket
CREATE POLICY "Clients can upload their meal photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meal-photos' AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  )
);

CREATE POLICY "Admins can view all meal photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Clients can view their meal photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  )
);

CREATE POLICY "Clients can delete their meal photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'meal-photos' AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  )
);

-- RLS policies for client-files bucket
CREATE POLICY "Clients can upload their files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-files' AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  )
);

CREATE POLICY "Admins can upload client files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-files' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view all client files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-files' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Clients can view their files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-files' AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  )
);

CREATE POLICY "Clients can delete their files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-files' AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  )
);

CREATE POLICY "Admins can delete client files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-files' AND
  has_role(auth.uid(), 'admin'::app_role)
);

-- RLS policies for weekly-plan-pdfs bucket
CREATE POLICY "Admins can upload plan PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'weekly-plan-pdfs' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view all plan PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'weekly-plan-pdfs' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Clients can view their plan PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'weekly-plan-pdfs' AND
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
    AND (storage.foldername(name))[1] = clients.id::text
  )
);

CREATE POLICY "Admins can delete plan PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'weekly-plan-pdfs' AND
  has_role(auth.uid(), 'admin'::app_role)
);