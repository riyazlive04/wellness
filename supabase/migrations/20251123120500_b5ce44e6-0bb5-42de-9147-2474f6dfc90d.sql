-- Phase 1: Add assessment type enum and column
CREATE TYPE assessment_type AS ENUM ('health', 'stress', 'sleep', 'custom');
ALTER TABLE assessments ADD COLUMN assessment_type assessment_type DEFAULT 'health';

-- Phase 3: Create workflow state table
CREATE TABLE client_workflow_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) NOT NULL UNIQUE,
  service_type TEXT NOT NULL,
  workflow_stage TEXT NOT NULL,
  stage_completed_at TIMESTAMPTZ,
  next_action TEXT,
  next_action_due_at TIMESTAMPTZ,
  retargeting_enabled BOOLEAN DEFAULT false,
  retargeting_frequency TEXT DEFAULT 'weekly',
  retargeting_last_sent TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create workflow history log
CREATE TABLE workflow_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) NOT NULL,
  workflow_stage TEXT NOT NULL,
  action TEXT NOT NULL,
  triggered_by TEXT,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE client_workflow_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage workflow state"
  ON client_workflow_state FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their workflow state"
  ON client_workflow_state FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = client_workflow_state.client_id 
    AND clients.user_id = auth.uid()
  ));

CREATE POLICY "Admins can view workflow history"
  ON workflow_history FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert workflow history"
  ON workflow_history FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_workflow_state_client ON client_workflow_state(client_id);
CREATE INDEX idx_workflow_state_next_action ON client_workflow_state(next_action_due_at) WHERE next_action IS NOT NULL;
CREATE INDEX idx_workflow_history_client ON workflow_history(client_id, triggered_at DESC);
CREATE INDEX idx_assessments_type ON assessments(assessment_type);

-- Create trigger for updated_at
CREATE TRIGGER update_workflow_state_updated_at
  BEFORE UPDATE ON client_workflow_state
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();