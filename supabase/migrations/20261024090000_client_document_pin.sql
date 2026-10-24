-- A 4-digit PIN the nutritionist sets on a client's documents.
--
-- The practice turns this on for a client whose phone is shared, or whose
-- reports are sensitive. Once set, the client must enter the PIN before their
-- Files and Progress photos will open, on the portal and in the app.
--
-- Stored as a salted scrypt hash, never in clear text. A nutritionist setting
-- a PIN can always replace it, so there is no need to read one back - and a
-- leaked table should not hand over every client's PIN. Four digits is only
-- 10,000 combinations, so the hash alone is a speed bump rather than a
-- defence; the attempt limiter below is what actually stops guessing.
--
-- NOT a security boundary on the files themselves: documents remain behind
-- short-lived signed URLs and ordinary row ownership. This stops someone
-- picking up an unlocked phone, which is the threat the practice described.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS document_pin_hash   text,
  ADD COLUMN IF NOT EXISTS document_pin_set_at timestamptz,
  -- Who turned it on, so a client asking "why am I being asked for a PIN?"
  -- can be answered from the record rather than from memory.
  ADD COLUMN IF NOT EXISTS document_pin_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Wrong-attempt throttle. Four digits guesses in seconds without it.
  ADD COLUMN IF NOT EXISTS document_pin_failed_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS document_pin_locked_until timestamptz;

COMMENT ON COLUMN public.clients.document_pin_hash IS
  'scrypt hash (salt:key) of a 4-digit PIN the practice set on this client''s documents. NULL = no PIN, documents open normally.';
COMMENT ON COLUMN public.clients.document_pin_locked_until IS
  'Set when too many wrong PINs are entered; reads of files/photos stay blocked until it passes.';

-- Finding "which of my clients have a PIN" is a dashboard question, and the
-- column is null for most rows, so a partial index keeps it small.
CREATE INDEX IF NOT EXISTS clients_document_pin_set_idx
  ON public.clients (workspace_id)
  WHERE document_pin_hash IS NOT NULL;
