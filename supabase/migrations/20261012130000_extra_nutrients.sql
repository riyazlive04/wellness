-- Extra nutrient columns a practice tracks on its meal plans (sodium,
-- potassium, or its own, e.g. "Water, ml"), and each planned meal's values.
--   workspaces.extra_nutrients: [{"key":"sodium_mg","label":"Sodium","unit":"mg"}, ...]
--   meal_cards.extra_nutrients: {"sodium_mg": 320, "x_water": 250}
alter table public.workspaces
  add column if not exists extra_nutrients jsonb not null default '[]'::jsonb;

alter table public.meal_cards
  add column if not exists extra_nutrients jsonb not null default '{}'::jsonb;
