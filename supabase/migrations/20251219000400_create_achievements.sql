-- Drop tables to ensure clean slate (CASCADE to remove foreign keys/policies)
DROP TABLE IF EXISTS public.user_achievements CASCADE;
DROP TABLE IF EXISTS public.achievements CASCADE;

-- Create achievements table
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, -- e.g., 'streak_7_days'
  title text NOT NULL,
  description text NOT NULL,
  icon_name text NOT NULL, -- Logical name for frontend icon mapping
  category text NOT NULL CHECK (category IN ('streak', 'meal', 'water', 'activity', 'assessment')),
  target_value integer NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- RLS: Everyone can read achievements
CREATE POLICY "Everyone can read achievements"
  ON public.achievements FOR SELECT
  TO authenticated
  USING (true);

-- Create user_achievements table to track progress
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  achievement_id uuid REFERENCES public.achievements(id) ON DELETE CASCADE NOT NULL,
  current_value integer DEFAULT 0 NOT NULL,
  is_unlocked boolean DEFAULT false NOT NULL,
  unlocked_at timestamptz,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, achievement_id)
);

-- Enable RLS
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own progress
CREATE POLICY "Users can view own achievements"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS: Admins can view all user achievements
CREATE POLICY "Admins can view all user achievements"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id::text = auth.uid()::text AND role = 'admin')
  );

-- Seed initial achievements
INSERT INTO public.achievements (code, title, description, icon_name, category, target_value)
VALUES
  -- Streaks
  ('streak_3_days', 'On a Roll', 'Log your daily activity for 3 days in a row', 'flame', 'streak', 3),
  ('streak_7_days', 'Unstoppable', 'Log your daily activity for 7 days in a row', 'zap', 'streak', 7),
  ('streak_30_days', 'Lifestyle Master', 'Log your daily activity for 30 days in a row', 'trophy', 'streak', 30),
  
  -- Meals
  ('meal_10', 'Foodie Beginner', 'Log 10 meals', 'utensils', 'meal', 10),
  ('meal_50', 'Nutrition Tracker', 'Log 50 meals', 'chef-hat', 'meal', 50),
  ('meal_100', 'Macro Calculator', 'Log 100 meals', 'scale', 'meal', 100),
  
  -- Water
  ('water_7_days', 'Hydration Hero', 'Hit your water goal for 7 days', 'droplet', 'water', 7),
  
  -- Activity
  ('activity_1000_min', 'Mover & Shaker', 'Log 1000 minutes of activity total', 'activity', 'activity', 1000),
  
  -- Assessment
  ('assessment_first', 'Checkup Champ', 'Complete your first health assessment', 'clipboard-check', 'assessment', 1)
ON CONFLICT (code) DO NOTHING;
