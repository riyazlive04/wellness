-- Add author_role to community_posts
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS author_role text;

-- Add author_role to community_comments
ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS author_role text;

-- Create community_rate_limits if not exists
CREATE TABLE IF NOT EXISTS community_rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  action_date date NOT NULL,
  count integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, action_type, action_date)
);

-- RLS for rate limits
ALTER TABLE community_rate_limits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Users can read own rate limits" ON community_rate_limits;
DROP POLICY IF EXISTS "Users can insert own rate limits" ON community_rate_limits;
DROP POLICY IF EXISTS "Users can update own rate limits" ON community_rate_limits;

CREATE POLICY "Users can read own rate limits"
  ON community_rate_limits FOR SELECT
  USING (auth.uid()::text = client_id::text);

CREATE POLICY "Users can insert own rate limits"
  ON community_rate_limits FOR INSERT
  WITH CHECK (auth.uid()::text = client_id::text);

CREATE POLICY "Users can update own rate limits"
  ON community_rate_limits FOR UPDATE
  USING (auth.uid()::text = client_id::text);
