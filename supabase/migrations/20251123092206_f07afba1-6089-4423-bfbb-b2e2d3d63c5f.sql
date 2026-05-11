-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('system', 'admin', 'client')),
  message_type TEXT NOT NULL CHECK (message_type IN ('motivation', 'achievement', 'reminder', 'manual', 'activity_update', 'lead_welcome', 'weight_logged', 'meal_logged', 'water_goal', 'streak', 'weekly_checkin')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create message_templates table
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  template TEXT NOT NULL,
  variables TEXT[] DEFAULT ARRAY[]::TEXT[],
  trigger_event TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON public.messages(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON public.messages(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_message_templates_name ON public.message_templates(name);
CREATE INDEX IF NOT EXISTS idx_message_templates_trigger_event ON public.message_templates(trigger_event);

-- Enable Row Level Security
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages table
CREATE POLICY "Clients can view their own messages"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = messages.client_id
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all messages"
  ON public.messages
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can insert their own messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = messages.client_id
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update messages"
  ON public.messages
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can update their own messages"
  ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = messages.client_id
      AND clients.user_id = auth.uid()
    )
  );

-- RLS Policies for message_templates table
CREATE POLICY "Anyone authenticated can view active templates"
  ON public.message_templates
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage templates"
  ON public.message_templates
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Seed default message templates
INSERT INTO public.message_templates (name, category, template, variables, trigger_event, is_active) VALUES
  -- Morning Motivation (Daily)
  ('morning_motivation_1', 'motivation', 'Good morning {name}! 👋 Ready to conquer the day? Don''t forget to log your weight!', ARRAY['name'], 'daily_morning', true),
  ('morning_motivation_2', 'motivation', 'Rise and shine, {name}! ☀️ Today is a new opportunity to get closer to your goals!', ARRAY['name'], 'daily_morning', true),
  ('morning_motivation_3', 'motivation', 'Morning {name}! 🌟 Remember: Progress, not perfection. You''ve got this!', ARRAY['name'], 'daily_morning', true),
  
  -- Weight Logged
  ('weight_logged_positive', 'activity_update', 'Great start to the day, {name}! Consistency is key. Keep it up! 👍', ARRAY['name', 'weight'], 'weight_logged', true),
  ('weight_logged_loss', 'activity_update', '{name}, you''re {diff}kg closer to your goal! Keep the momentum going! 🎯', ARRAY['name', 'weight', 'diff'], 'weight_logged', true),
  ('weight_logged_maintain', 'activity_update', 'Awesome, {name}! You logged {weight}kg. Consistency wins! 💪', ARRAY['name', 'weight'], 'weight_logged', true),
  
  -- Meal Logged
  ('meal_logged_breakfast', 'activity_update', 'Breakfast logged! 🍳 Great way to start the day, {name}!', ARRAY['name', 'meal_type', 'time'], 'meal_logged', true),
  ('meal_logged_lunch', 'activity_update', 'Lunch logged! 🍽️ Great job staying on track, {name}!', ARRAY['name', 'meal_type', 'time'], 'meal_logged', true),
  ('meal_logged_dinner', 'activity_update', 'Dinner logged! 🌙 Ending the day strong, {name}!', ARRAY['name', 'meal_type', 'time'], 'meal_logged', true),
  ('meal_logged_snack', 'activity_update', 'Snack logged! 😋 Smart choices, {name}!', ARRAY['name', 'meal_type', 'time'], 'meal_logged', true),
  
  -- Water Goal
  ('water_goal_reached', 'achievement', '🎉 Hydration champion! You''ve reached your {amount}ml water goal for today!', ARRAY['name', 'amount'], 'water_goal', true),
  ('water_halfway', 'reminder', '💧 Halfway there, {name}! Keep sipping to reach your water goal!', ARRAY['name', 'amount'], 'water_goal', true),
  
  -- Activity
  ('activity_milestone_30', 'achievement', '🏃 30 minutes of activity! You''re crushing it, {name}!', ARRAY['name', 'minutes'], 'activity_logged', true),
  ('activity_logged', 'activity_update', 'Great job logging {minutes} minutes of activity, {name}! 💪', ARRAY['name', 'minutes'], 'activity_logged', true),
  
  -- Streak Milestones
  ('streak_milestone_3', 'achievement', '🔥 3 day streak! You''re building momentum, {name}!', ARRAY['name', 'streak'], 'streak_milestone', true),
  ('streak_milestone_7', 'achievement', '🔥 7 day streak! One week of consistency! Amazing, {name}!', ARRAY['name', 'streak'], 'streak_milestone', true),
  ('streak_milestone_14', 'achievement', '🔥 14 day streak! Two weeks strong! You''re unstoppable, {name}!', ARRAY['name', 'streak'], 'streak_milestone', true),
  ('streak_milestone_30', 'achievement', '🔥 30 day streak! One month of dedication! Incredible, {name}!', ARRAY['name', 'streak'], 'streak_milestone', true),
  
  -- Weekly Check-in
  ('weekly_checkin', 'reminder', 'Hey {name}, how was your week? Let''s review your progress together! 📊', ARRAY['name', 'week_number'], 'weekly_checkin', true),
  
  -- Interest Form
  ('interest_form_thank_you', 'lead_welcome', 'Hi {name}! 👋 Thank you for your interest in Sheizen AI Nutritionist. We''re excited to help you achieve your {health_goal} goals! Our team will reach out to you soon.', ARRAY['name', 'health_goal'], 'interest_form', true)
ON CONFLICT (name) DO NOTHING;