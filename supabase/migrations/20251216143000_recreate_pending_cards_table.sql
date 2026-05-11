-- Recreate pending_review_cards table to fix corrupted schema
-- ADAPTED: defined client_id as TEXT to match public.clients.id type
-- ADAPTED: defined reviewed_by as TEXT to match public.profiles.id type
-- ADAPTED: removed ::app_role cast
-- ADAPTED: Added handle_updated_at function definition to ensure it exists

-- Ensure the trigger function exists
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop dependent triggers first
DROP TRIGGER IF EXISTS update_pending_review_cards_updated_at ON public.pending_review_cards;

-- Drop table
DROP TABLE IF EXISTS public.pending_review_cards CASCADE;

-- Re-create table with correct schema
CREATE TABLE public.pending_review_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('health_assessment', 'stress_card', 'sleep_card', 'action_plan', 'diet_plan')),
  generated_content JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'edited', 'sent')),
  workflow_stage TEXT NOT NULL,
  ai_generated_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by TEXT REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_pending_cards_client ON public.pending_review_cards(client_id);
CREATE INDEX idx_pending_cards_status ON public.pending_review_cards(status);
CREATE INDEX idx_pending_cards_type ON public.pending_review_cards(card_type);
CREATE INDEX idx_pending_cards_workflow_stage ON public.pending_review_cards(workflow_stage);

-- Enable RLS
ALTER TABLE public.pending_review_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all pending review cards"
  ON public.pending_review_cards
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their own sent cards"
  ON public.pending_review_cards
  FOR SELECT
  USING (
    status = 'sent' 
    AND EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = pending_review_cards.client_id 
      AND clients.user_id::text = auth.uid()::text
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER update_pending_review_cards_updated_at
  BEFORE UPDATE ON public.pending_review_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
