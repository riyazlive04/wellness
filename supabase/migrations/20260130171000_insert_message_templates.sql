-- Fix: Ensure unique constraint exists on name before inserting
DO $$
BEGIN
    -- Check if a unique constraint/index on 'name' exists
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_index i ON i.indrelid = c.oid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
        WHERE n.nspname = 'public'
          AND c.relname = 'message_templates'
          AND a.attname = 'name'
          AND i.indisunique
    ) THEN
        -- Add the unique constraint if it doesn't exist
        ALTER TABLE public.message_templates ADD CONSTRAINT message_templates_name_key UNIQUE (name);
    END IF;
END $$;

-- Insert with all required fields
-- Explicitly generating ID and providing category to satisfy constraints
-- variables column is JSONB, so we cast JSON strings to jsonb
INSERT INTO public.message_templates (id, name, category, template, variables, trigger_event, is_active)
VALUES 
  -- Activity
  (gen_random_uuid(), 'activity_logged', 'activity_update', 'Great job logging your activity, {name}! Keep moving!', '["name"]'::jsonb, 'activity_log', true),
  (gen_random_uuid(), 'activity_milestone_30', 'achievement', 'Wow! You''ve reached 30 minutes of activity today. That''s fantastic work, {name}!', '["name"]'::jsonb, 'activity_milestone', true),

  -- Meal Logging
  (gen_random_uuid(), 'meal_logged_breakfast', 'activity_update', 'Good morning {name}! Thanks for logging your breakfast. Starting the day right!', '["name"]'::jsonb, 'meal_log', true),
  -- FIXED: Swapped variables and trigger_event order back to correct one
  (gen_random_uuid(), 'meal_logged_lunch', 'activity_update', 'Lunch logged! Hope it was delicious and nutritious.', '["name"]'::jsonb, 'meal_log', true),
  (gen_random_uuid(), 'meal_logged_dinner', 'activity_update', 'Dinner logged. You''re doing great tracking your meals today.', '["name"]'::jsonb, 'meal_log', true),
  (gen_random_uuid(), 'meal_logged_snack', 'activity_update', 'Smart snacking! Thanks for logging it.', '["name"]'::jsonb, 'meal_log', true),

  -- Weight
  (gen_random_uuid(), 'weight_logged_loss', 'activity_update', 'Congratulations {name}! You''ve lost weight. Your hard work is paying off!', '["name"]'::jsonb, 'weight_log', true),
  (gen_random_uuid(), 'weight_logged_maintain', 'activity_update', 'You''re maintaining your weight perfectly. Consistency is key!', '["name"]'::jsonb, 'weight_log', true),
  (gen_random_uuid(), 'weight_logged_positive', 'activity_update', 'Thanks for logging your weight. Fluctuations are normal, keep focused on your long-term goals!', '["name"]'::jsonb, 'weight_log', true),

  -- Water
  (gen_random_uuid(), 'water_halfway', 'reminder', 'You''re halfway to your water goal for today! Drink up!', '[]'::jsonb, 'water_log', true),
  (gen_random_uuid(), 'water_goal_reached', 'achievement', 'Hydration hero! You hit your water goal for the day.', '[]'::jsonb, 'water_log', true),

  -- Streaks
  (gen_random_uuid(), 'streak_milestone_3', 'achievement', 'You''re on a roll! 3 day streak achieved.', '[]'::jsonb, 'streak_milestone', true),
  (gen_random_uuid(), 'streak_milestone_7', 'achievement', 'One full week! 7 day streak. That''s amazing dedication, {name}.', '["name"]'::jsonb, 'streak_milestone', true),
  (gen_random_uuid(), 'streak_milestone_14', 'achievement', 'Two weeks strong! 14 day streak. You''re building unstoppable habits.', '[]'::jsonb, 'streak_milestone', true),
  (gen_random_uuid(), 'streak_milestone_30', 'achievement', 'INOREDIBLE! 30 day streak. You have truly simplified your wellness journey.', '[]'::jsonb, 'streak_milestone', true),

  -- Motivation
  (gen_random_uuid(), 'morning_motivation_1', 'motivation', 'Good morning {name}! "The only bad workout is the one that didn''t happen." Have a great day!', '["name"]'::jsonb, 'scheduled_morning', true),
  (gen_random_uuid(), 'morning_motivation_2', 'motivation', 'Rise and shine! Remember your goal: {program_type}. You got this!', '["name", "program_type"]'::jsonb, 'scheduled_morning', true),
  (gen_random_uuid(), 'morning_motivation_3', 'motivation', 'New day, new opportunity. Make healthy choices today!', '[]'::jsonb, 'scheduled_morning', true),

  -- General
  (gen_random_uuid(), 'weekly_checkin', 'reminder', 'Hi {name}, it''s time for your weekly check-in. Please update your weight and measurements so we can track your progress.', '["name"]'::jsonb, 'scheduled_weekly', true),
  (gen_random_uuid(), 'interest_form_thank_you', 'lead_welcome', 'Hi {name}, thanks for expressing interest! We will be in touch shortly to discuss your personalized plan.', '["name"]'::jsonb, 'interest_form', true)

ON CONFLICT (name) DO UPDATE 
SET 
  category = EXCLUDED.category,
  template = EXCLUDED.template,
  variables = EXCLUDED.variables,
  trigger_event = EXCLUDED.trigger_event,
  is_active = EXCLUDED.is_active;
