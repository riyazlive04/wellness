-- Meal photos move from inlined base64 to the storage bucket.
--
-- A practice reported logged meals showing the food name and calories but no
-- picture. Measuring production found the cause: every plate photo is stored
-- as a base64 data: URI on plate_vision_meals.photo_url, averaging ~100 kB and
-- reaching 170 kB. The practitioner meal list deliberately refuses to return
-- those - it returns a photo only when it is an https:// link, else the small
-- thumbnail - because a list of 300 meals each carrying 100 kB inline is tens
-- of megabytes on one request. So any plate whose thumbnail failed to generate
-- showed no image at all: 44 of 221 plate meals in a fortnight.
--
-- Same root cause as the chat attachments fixed on 2026-10-29, and the same
-- remedy: keep the bytes in a bucket, keep a key on the row, sign a URL when
-- a list is read. See 20261029180000_chat_media_storage.sql.
--
-- photo_url is kept, not dropped. 67 existing plates hold a data: URI that is
-- the ONLY copy of that photo, and the reader prefers whichever is present.

-- A private bucket: a photo of someone's meal is personal data and must never
-- be world-readable by URL. Reads go through a signed URL, as chat media does.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meal-photos',
  'meal-photos',
  false,
  26214400,                                        -- 25 MB, matching chat-media
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.plate_vision_meals
  ADD COLUMN IF NOT EXISTS photo_storage_key text;

COMMENT ON COLUMN public.plate_vision_meals.photo_storage_key IS
  'Object key in the meal-photos bucket. Preferred over photo_url, which only holds legacy inlined data: URIs.';

-- The list query filters on this, so it must not scan every row to find the
-- handful that are still on the old inline representation.
CREATE INDEX IF NOT EXISTS plate_vision_meals_photo_key_idx
  ON public.plate_vision_meals (client_id, logged_at DESC)
  WHERE photo_storage_key IS NOT NULL;
