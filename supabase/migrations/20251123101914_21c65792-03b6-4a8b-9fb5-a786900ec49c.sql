-- =============================================
-- Phase 1: AI-Powered Features & Calendar Integration
-- Database Foundation
-- =============================================

-- 1. ACTION PLANS TABLE
-- Stores AI-generated visual action plans (PNG images)
CREATE TABLE action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) NOT NULL,
  plan_image_url TEXT NOT NULL,
  goals TEXT,
  lifestyle TEXT,
  age INTEGER,
  diet_type TEXT,
  daily_habits JSONB,
  dos JSONB,
  donts JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage action plans" 
ON action_plans FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their action plans" 
ON action_plans FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = action_plans.client_id 
    AND clients.user_id = auth.uid()
  )
);

-- Index for performance
CREATE INDEX idx_action_plans_client_id ON action_plans(client_id);

-- Updated_at trigger
CREATE TRIGGER update_action_plans_updated_at
BEFORE UPDATE ON action_plans
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- =============================================
-- 2. DIET PREFERENCES TABLE
-- Stores client dietary preferences for AI meal plan generation
CREATE TABLE diet_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) NOT NULL,
  dietary_type TEXT CHECK (dietary_type IN ('veg', 'non_veg', 'vegan')),
  food_dislikes JSONB DEFAULT '[]'::jsonb,
  meals_per_day INTEGER DEFAULT 4 CHECK (meals_per_day BETWEEN 3 AND 5),
  meal_timings JSONB,
  calorie_target INTEGER,
  allergies TEXT[],
  preferences_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- Enable RLS
ALTER TABLE diet_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage diet preferences" 
ON diet_preferences FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can manage their own preferences" 
ON diet_preferences FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = diet_preferences.client_id 
    AND clients.user_id = auth.uid()
  )
);

-- Index
CREATE INDEX idx_diet_preferences_client_id ON diet_preferences(client_id);

-- Updated_at trigger
CREATE TRIGGER update_diet_preferences_updated_at
BEFORE UPDATE ON diet_preferences
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- =============================================
-- 3. FOLLOW-UPS TABLE
-- Tracks scheduled follow-up calls and check-ins
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  follow_up_type TEXT CHECK (follow_up_type IN ('14_day', '28_day', '42_day', '56_day', '70_day', '84_day', '100_day')),
  pre_call_form_data JSONB,
  admin_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage follow-ups" 
ON follow_ups FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their follow-ups" 
ON follow_ups FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = follow_ups.client_id 
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Clients can update pre-call forms" 
ON follow_ups FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = follow_ups.client_id 
    AND clients.user_id = auth.uid()
  )
) 
WITH CHECK (pre_call_form_data IS NOT NULL);

-- Indexes
CREATE INDEX idx_follow_ups_client_id ON follow_ups(client_id);
CREATE INDEX idx_follow_ups_scheduled_date ON follow_ups(scheduled_date);
CREATE INDEX idx_follow_ups_status ON follow_ups(status);

-- Updated_at trigger
CREATE TRIGGER update_follow_ups_updated_at
BEFORE UPDATE ON follow_ups
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- =============================================
-- 4. ENHANCE ASSESSMENTS TABLE
-- Add AI-generated assessment fields
ALTER TABLE assessments 
  ADD COLUMN IF NOT EXISTS assessment_data JSONB,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_responses JSONB;

-- =============================================
-- 5. CALENDAR EVENTS TABLE
-- Internal calendar for meal plans, follow-ups, milestones
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) NOT NULL,
  event_type TEXT CHECK (event_type IN ('meal_plan', 'follow_up', 'milestone', 'activity')),
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all events" 
ON calendar_events FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their events" 
ON calendar_events FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = calendar_events.client_id 
    AND clients.user_id = auth.uid()
  )
);

-- Indexes
CREATE INDEX idx_calendar_events_client_id ON calendar_events(client_id);
CREATE INDEX idx_calendar_events_event_date ON calendar_events(event_date);
CREATE INDEX idx_calendar_events_event_type ON calendar_events(event_type);

-- =============================================
-- 6. MEAL COMPLIANCE TABLE
-- Stores calculated compliance metrics
CREATE TABLE meal_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  overall_compliance NUMERIC(5,2),
  photo_compliance NUMERIC(5,2),
  calorie_accuracy NUMERIC(5,2),
  by_meal_type JSONB,
  by_day JSONB,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, week_start)
);

-- Enable RLS
ALTER TABLE meal_compliance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage compliance records" 
ON meal_compliance FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their compliance" 
ON meal_compliance FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = meal_compliance.client_id 
    AND clients.user_id = auth.uid()
  )
);

-- Indexes
CREATE INDEX idx_meal_compliance_client_id ON meal_compliance(client_id);
CREATE INDEX idx_meal_compliance_week_start ON meal_compliance(week_start);

-- =============================================
-- 7. STORAGE BUCKETS
-- =============================================

-- Action Plan Images Bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'action-plan-images',
  'action-plan-images',
  false,
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Health Assessments Bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'health-assessments',
  'health-assessments',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 8. STORAGE RLS POLICIES
-- =============================================

-- Action Plan Images - Admin upload
CREATE POLICY "Admins can upload action plan images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'action-plan-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Action Plan Images - View (admins and clients)
CREATE POLICY "Admins can view all action plan images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'action-plan-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Clients can view their action plan images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'action-plan-images'
  AND EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
  )
);

-- Action Plan Images - Update/Delete (admins only)
CREATE POLICY "Admins can update action plan images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'action-plan-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete action plan images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'action-plan-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Health Assessments - Admin upload
CREATE POLICY "Admins can upload health assessments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'health-assessments' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Health Assessments - View (admins and clients)
CREATE POLICY "Admins can view all health assessments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'health-assessments' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Clients can view their health assessments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'health-assessments'
  AND EXISTS (
    SELECT 1 FROM clients
    WHERE clients.user_id = auth.uid()
  )
);

-- Health Assessments - Update/Delete (admins only)
CREATE POLICY "Admins can update health assessments"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'health-assessments' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete health assessments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'health-assessments' 
  AND has_role(auth.uid(), 'admin'::app_role)
);