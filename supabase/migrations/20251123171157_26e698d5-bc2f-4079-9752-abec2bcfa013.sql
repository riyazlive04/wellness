-- Create assessment request status enum
CREATE TYPE assessment_request_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- Create assessment_requests table
CREATE TABLE assessment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL,
  status assessment_request_status DEFAULT 'pending',
  requested_by UUID,
  requested_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE assessment_requests ENABLE ROW LEVEL SECURITY;

-- Admins can manage all requests
CREATE POLICY "Admins can manage assessment requests"
  ON assessment_requests FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their own requests
CREATE POLICY "Clients can view their requests"
  ON assessment_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = assessment_requests.client_id
      AND clients.user_id = auth.uid()
    )
  );

-- Clients can update their requests (for marking in_progress)
CREATE POLICY "Clients can update their requests"
  ON assessment_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = assessment_requests.client_id
      AND clients.user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_assessment_requests_client_id ON assessment_requests(client_id);
CREATE INDEX idx_assessment_requests_status ON assessment_requests(status);
CREATE INDEX idx_assessment_requests_type ON assessment_requests(assessment_type);

-- Trigger for updated_at
CREATE TRIGGER update_assessment_requests_updated_at
  BEFORE UPDATE ON assessment_requests
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();