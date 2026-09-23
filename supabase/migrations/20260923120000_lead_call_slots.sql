-- Demo-call slots for landing-page leads.
--
-- The booking form now asks for a slot, so each lead carries the time the call
-- is booked for. Two leads must never hold the same slot, hence the unique
-- index: a cancelled/lost lead still keeps its slot until the team clears it,
-- which is deliberate - the call was really taken off the calendar.
--
-- calendar_event_id is Google Calendar's id for the event NUSI creates, kept so
-- the event can be found (and later moved or cancelled) without guessing.

alter table public.leads
  add column if not exists slot_start        timestamptz,
  add column if not exists calendar_event_id text;

create unique index if not exists leads_slot_start_key
  on public.leads (slot_start)
  where slot_start is not null;

create index if not exists leads_slot_start_idx on public.leads (slot_start);
