-- Chat attachments in storage instead of inside the message row.
--
-- Every attachment so far is an inlined base64 `data:` URI in
-- messages.attachment_url. Measured in production: 6 attachments totalling
-- 961 kB, the largest 825 kB on its own, and the heaviest single thread is
-- 962 kB of payload across 70 messages.
--
-- The thread refetches every 4 seconds while a conversation is open, so that
-- thread re-downloads about a megabyte every 4 seconds - roughly 15 MB a
-- minute, on a nutritionist's mobile data, for messages that have not changed.
-- It also forces two limits the practice feels: images are downscaled to
-- 1280px to survive the JSON body, and non-image files are refused over
-- 1.4 MB.
--
-- A storage key costs ~60 bytes, so the same thread becomes ~1 kB and the
-- bytes are fetched once by the browser and cached like any other image.

-- Private bucket, read through short-lived signed URLs like client-files.
-- 25 MB covers a phone photo or a short voice note without inviting video.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  26214400, -- 25 MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic',
    'audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
    'video/mp4', 'video/webm',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Where the bytes actually live.
--
-- Kept separate from attachment_url rather than replacing it: existing rows
-- hold data: URIs that still have to render, and rewriting them in place
-- would mean decoding and re-uploading six files inside a migration. New
-- messages set storage_key and leave attachment_url null; the reader prefers
-- whichever is present. See the backfill note at the bottom.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_storage_key text;

COMMENT ON COLUMN public.messages.attachment_storage_key IS
  'Object key in the chat-media bucket. Preferred over attachment_url, which only holds legacy inlined data: URIs.';

COMMENT ON COLUMN public.messages.attachment_url IS
  'LEGACY: inlined base64 data: URI. New messages use attachment_storage_key instead - an inlined attachment is re-downloaded on every poll.';

-- Finding a thread's media without scanning the table.
CREATE INDEX IF NOT EXISTS messages_attachment_storage_idx
  ON public.messages (client_id, created_at DESC)
  WHERE attachment_storage_key IS NOT NULL;

-- The six legacy rows are deliberately left as they are.
--
-- They are a one-off: 961 kB total, already sent, and they keep rendering
-- because the reader falls back to attachment_url. Moving them would need the
-- bytes decoded and PUT to the bucket, which belongs in a script that can be
-- re-run and checked, not in a migration that must not fail halfway. New
-- traffic - the part that actually repeats every 4 seconds - goes to storage
-- from here on.
