-- Create pending review cards table for admin review workflow
CREATE TABLE IF NOT EXISTS public.pending_review_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('health_assessment', 'stress_card', 'sleep_card', 'action_plan', 'diet_plan')),
  generated_content JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'edited', 'sent')),
  workflow_stage TEXT NOT NULL,
  ai_generated_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
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
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their own sent cards"
  ON public.pending_review_cards
  FOR SELECT
  USING (
    status = 'sent' 
    AND EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = pending_review_cards.client_id 
      AND clients.user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER update_pending_review_cards_updated_at
  BEFORE UPDATE ON public.pending_review_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();