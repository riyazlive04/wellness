-- When the phone app already got a notification by push (FCM), its own
-- background check skips it, so a reminder never shows twice.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
