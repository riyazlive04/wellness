-- Add attachment columns to messages table for file upload support
ALTER TABLE public.messages
ADD COLUMN attachment_url TEXT,
ADD COLUMN attachment_name TEXT,
ADD COLUMN attachment_type TEXT,
ADD COLUMN attachment_size INTEGER;

-- Add bulk messaging tracking columns to messages table
ALTER TABLE public.messages
ADD COLUMN batch_id UUID,
ADD COLUMN is_bulk BOOLEAN DEFAULT false;

-- Create bulk_message_batches table for tracking bulk sends
CREATE TABLE public.bulk_message_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  template_id UUID REFERENCES public.message_templates(id),
  recipient_count INTEGER NOT NULL,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS on bulk_message_batches
ALTER TABLE public.bulk_message_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies for bulk_message_batches
CREATE POLICY "Admins can view all batches"
ON public.bulk_message_batches
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create batches"
ON public.bulk_message_batches
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update batches"
ON public.bulk_message_batches
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create message-attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'audio/mpeg', 'audio/mp4']
);

-- RLS policies for message-attachments bucket
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Users can view their message attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'message-attachments');

CREATE POLICY "Users can delete their attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'message-attachments');

-- Create index on batch_id for faster queries
CREATE INDEX idx_messages_batch_id ON public.messages(batch_id) WHERE batch_id IS NOT NULL;