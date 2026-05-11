
-- Temporary debug policy to rule out RLS issues
-- This allows ANYONE (even anon) to see pending cards.
-- If the cards appear after applying this, the issue is with the 'has_role' check or user permissions.

CREATE POLICY "Debug Access" 
ON public.pending_review_cards 
FOR SELECT 
USING (true);
