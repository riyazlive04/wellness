-- Fibre on planned meals. Plans carried kcal, protein, carbs and fat only, so
-- fruit- and vegetable-heavy plans showed no fibre anywhere; logged meals
-- already record it in their nutrition snapshot.
alter table public.meal_cards
  add column if not exists fiber_g numeric;
