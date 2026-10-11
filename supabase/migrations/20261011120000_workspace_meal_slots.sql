-- A practice's meal times: which slots its clients see and what they're
-- called, e.g. [{"slot":"breakfast","label":"First Meal"},{"slot":"lunch",
-- "label":"Mid Meal"},{"slot":"dinner","label":"Last Meal"}]. NULL = the
-- standard five (breakfast, mid-morning, lunch, evening snack, dinner).
alter table public.workspaces
  add column if not exists meal_slots jsonb;

-- Meal times used to be renamed per client week (weekly_plans.slot_labels).
-- Carry each practice's most recent renames over so nothing it named is lost.
update public.workspaces w
   set meal_slots = (
     select jsonb_agg(
              jsonb_strip_nulls(jsonb_build_object('slot', d.slot, 'label', nullif(trim(latest.labels ->> d.slot), '')))
              order by d.ord)
       from (values ('breakfast', 1), ('mid_morning', 2), ('lunch', 3), ('evening_snack', 4), ('dinner', 5)) as d(slot, ord)
   )
  from (
    select distinct on (wp.workspace_id) wp.workspace_id, wp.slot_labels as labels
      from public.weekly_plans wp
     where wp.slot_labels is not null and wp.slot_labels <> '{}'::jsonb
     order by wp.workspace_id, wp.updated_at desc
  ) latest
 where latest.workspace_id = w.id
   and w.meal_slots is null;
