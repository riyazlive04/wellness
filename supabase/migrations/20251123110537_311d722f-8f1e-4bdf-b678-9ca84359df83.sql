-- Create push_subscriptions table for browser push notifications
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, endpoint)
);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own subscriptions"
  ON push_subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM clients 
      WHERE clients.id = push_subscriptions.client_id 
      AND clients.user_id = auth.uid()
    )
  );

-- Index for performance
CREATE INDEX idx_push_subscriptions_client_id ON push_subscriptions(client_id);
CREATE INDEX idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);