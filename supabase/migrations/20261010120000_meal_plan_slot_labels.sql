-- Nutritionists rename meal-time rows ("Breakfast" -> "Breakfast (8 AM)",
-- "Evening snack" -> "Pre-workout"). The slot itself (meal_type) stays the
-- same so meal logs, reminders and reports keep working; this only overrides
-- the name shown for that plan. Keys are meal_type values, e.g.
-- {"breakfast": "Breakfast (8 AM)"}.
alter table public.weekly_plans
  add column if not exists slot_labels jsonb not null default '{}'::jsonb;
