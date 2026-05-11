-- Create enum for achievement categories
CREATE TYPE achievement_category AS ENUM ('consistency', 'milestone', 'streak', 'special');

-- Create enum for achievement criteria types
CREATE TYPE achievement_criteria_type AS ENUM (
  'meal_log_streak',
  'meal_log_count',
  'hydration_streak',
  'hydration_perfect_week',
  'weight_loss_milestone',
  'weight_consistency',
  'activity_streak',
  'activity_total_minutes',
  'perfect_week',
  'early_bird',
  'first_meal'
);

-- Create achievements table (master definitions)
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category achievement_category NOT NULL,
  criteria_type achievement_criteria_type NOT NULL,
  criteria_value INTEGER NOT NULL,
  icon TEXT NOT NULL,
  badge_color TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_achievements table (earned achievements)
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  progress JSONB,
  UNIQUE(client_id, achievement_id)
);

CREATE INDEX idx_user_achievements_client ON public.user_achievements(client_id);
CREATE INDEX idx_user_achievements_earned ON public.user_achievements(earned_at);

-- Create achievement_progress table (real-time progress tracking)
CREATE TABLE public.achievement_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  current_value INTEGER DEFAULT 0,
  target_value INTEGER NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB,
  UNIQUE(client_id, achievement_id)
);

CREATE INDEX idx_achievement_progress_client ON public.achievement_progress(client_id);

-- Enable RLS on all tables
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for achievements (everyone can view)
CREATE POLICY "Anyone can view active achievements"
  ON public.achievements
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage achievements"
  ON public.achievements
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for user_achievements
CREATE POLICY "Clients can view their own achievements"
  ON public.user_achievements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = user_achievements.client_id
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all user achievements"
  ON public.user_achievements
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage user achievements"
  ON public.user_achievements
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for achievement_progress
CREATE POLICY "Clients can view their own progress"
  ON public.achievement_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = achievement_progress.client_id
      AND clients.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all progress"
  ON public.achievement_progress
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage progress"
  ON public.achievement_progress
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed initial achievements
INSERT INTO public.achievements (name, description, category, criteria_type, criteria_value, icon, badge_color, points) VALUES
('Getting Started', 'Log your first meal', 'special', 'first_meal', 1, 'Target', 'bronze', 10),
('Hydration Hero', 'Hit water goal for 7 days straight', 'consistency', 'hydration_streak', 7, 'Droplets', 'silver', 50),
('Weight Watcher', 'Log weight for 7 consecutive days', 'consistency', 'weight_consistency', 7, 'Scale', 'bronze', 30),
('Active Lifestyle', 'Log activity 5 days in a week', 'consistency', 'activity_streak', 5, 'Activity', 'bronze', 40),
('Week Warrior', 'Log 21 meals in a week', 'streak', 'meal_log_count', 21, 'Camera', 'silver', 60),
('30-Day Champion', 'Log meals for 30 consecutive days', 'streak', 'meal_log_streak', 30, 'Award', 'gold', 150),
('Consistency King', 'Log daily for 7 days straight', 'streak', 'meal_log_streak', 7, 'Star', 'silver', 50),
('First 5', 'Lose your first 5kg', 'milestone', 'weight_loss_milestone', 5, 'TrendingDown', 'gold', 100),
('Century Club', 'Log 100 total meals', 'milestone', 'meal_log_count', 100, 'Trophy', 'gold', 80),
('Hydration Master', 'Log 50L of water total', 'milestone', 'meal_log_count', 50000, 'GlassWater', 'silver', 70),
('Early Bird', 'Log breakfast before 9am for 7 days', 'special', 'early_bird', 7, 'Sunrise', 'bronze', 40),
('Perfect Week', 'Complete all weekly goals', 'special', 'perfect_week', 1, 'CheckCircle2', 'gold', 100),
('Progress Pro', 'Update all metrics in one day', 'special', 'meal_log_count', 1, 'BarChart3', 'bronze', 20);