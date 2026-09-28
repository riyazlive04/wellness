-- Booking hours per practice: when clients may request an appointment.
--
-- The client portal offers only free times inside these hours (see
-- backend/src/clients/booking-hours.ts). No row = the defaults in code
-- (Mon-Sat, 10:00-18:00 IST, lunch 13:00-14:00, 30-minute steps).
-- Times are minutes from midnight, India Standard Time.

create table if not exists public.workspace_booking_hours (
  workspace_id     uuid primary key references public.workspaces(id) on delete cascade,
  enabled          boolean   not null default true,
  days             smallint[] not null default '{1,2,3,4,5,6}',  -- 0 = Sunday
  day_start        smallint  not null default 600,
  day_end          smallint  not null default 1080,
  break_start      smallint           default 780,
  break_end        smallint           default 840,
  step_minutes     smallint  not null default 30,
  buffer_minutes   smallint  not null default 0,
  min_notice_hours smallint  not null default 2,
  horizon_days     smallint  not null default 14,
  updated_at       timestamptz not null default now(),
  constraint booking_hours_day check (day_start >= 0 and day_end <= 1440 and day_start < day_end),
  constraint booking_hours_break check (
    (break_start is null and break_end is null)
    or (break_start is not null and break_end is not null and break_start < break_end)
  )
);

-- Read and written only by the API (service role); nothing from the browser.
alter table public.workspace_booking_hours enable row level security;
