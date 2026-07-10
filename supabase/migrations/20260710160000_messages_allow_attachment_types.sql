-- Allow attachment message types on public.messages.
--
-- The original messages_message_type_check only permitted system-message
-- categories (motivation, manual, …). File/photo/voice attachments are inserted
-- with message_type 'image' | 'voice' | 'file', which the old constraint
-- rejected — so every attachment send failed with a 500. Add those (plus
-- 'text') to the allowed set.

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN (
    'motivation', 'achievement', 'reminder', 'manual', 'activity_update',
    'lead_welcome', 'weight_logged', 'meal_logged', 'water_goal', 'streak',
    'weekly_checkin', 'text', 'image', 'voice', 'file'
  ));
