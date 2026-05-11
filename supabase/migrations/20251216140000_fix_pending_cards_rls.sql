-- Fix RLS for pending_review_cards to ensure visibility
-- Using explicit text casting to handle potential type mismatches (uuid vs text)

-- Drop existing policies
drop policy if exists "Clients can view their own sent cards" on public.pending_review_cards;
drop policy if exists "Admins can manage all pending review cards" on public.pending_review_cards;

-- Re-create policies
create policy "Admins can manage all pending review cards"
  on public.pending_review_cards
  for all
  using (
    public.has_role(auth.uid(), 'admin')
  );

create policy "Clients can view their own sent cards"
  on public.pending_review_cards
  for select
  using (
    status = 'sent'
    and exists (
      select 1 from public.clients
      where clients.id::text = pending_review_cards.client_id::text
      and clients.user_id::text = auth.uid()::text
    )
  );
