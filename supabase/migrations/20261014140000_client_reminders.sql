-- Meal-time and water reminders the client app schedules on the phone.
-- NULL = never set up (the app offers to turn them on). Shape:
-- { meals_enabled, meal_times: { breakfast: "08:30", ... },
--   water_enabled, water_start: "07:00", water_end: "21:00", water_every_minutes: 60 }
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS reminder_settings jsonb;
