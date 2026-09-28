-- Each practice's own AI provider key (bring your own key).
--
-- A practice's AI features (assistant, plate scanner, voice, AI meal plans,
-- summaries) run on this key and bill the practice's own Google / OpenAI
-- account. The key is encrypted at rest with the same scheme as the
-- WhatsApp/email connection secrets (backend/src/connections/secret-crypto.ts)
-- and is never returned to the browser - only its last four characters.

create table if not exists public.workspace_ai_keys (
  workspace_id   uuid primary key references public.workspaces(id) on delete cascade,
  provider       text not null check (provider in ('gemini', 'openai')),
  key_enc        text not null,
  key_last4      text not null,
  status         text not null default 'connected' check (status in ('connected', 'error')),
  last_error     text,
  last_tested_at timestamptz,
  created_by     uuid,
  updated_at     timestamptz not null default now()
);

-- Only the API (service role) reads or writes keys; nothing from the browser.
alter table public.workspace_ai_keys enable row level security;
