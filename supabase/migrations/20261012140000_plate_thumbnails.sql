-- A small square thumbnail (~5 KB JPEG data URL) of each plate photo, for
-- meal lists. The full photo (~300 KB inline) is too heavy to send for every
-- row, so lists showed a fork icon instead of the picture.
alter table public.plate_vision_meals
  add column if not exists thumb_url text;
