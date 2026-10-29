-- Blood sugar a client monitors themselves, daily.
--
-- Practices asked to track fasting and post-meal sugar day by day, with a
-- graph both they and the client can see. The labs module already holds blood
-- markers with units, reference ranges and trend charts, so this extends it
-- rather than starting a second place for blood results to live - a client's
-- fasting sugar in two tables, depending on who typed it, is the kind of split
-- that makes a number impossible to trust.
--
-- Two things it needs that a lab report does not:

-- 1. A third source.
--
-- 'manual' is a practitioner typing off a report and 'form' is a submitted
-- lab_results card. A reading a patient took at home on a glucometer is
-- neither: it is less precise than a venous lab draw, and a practitioner
-- reviewing a trend should be able to see which points came from where.
-- Without this they are indistinguishable and a home reading could be read as
-- a lab result.
ALTER TABLE public.client_lab_results
  DROP CONSTRAINT IF EXISTS client_lab_results_source_check;
ALTER TABLE public.client_lab_results
  ADD CONSTRAINT client_lab_results_source_check
  CHECK (source IN ('manual', 'form', 'self'));

COMMENT ON COLUMN public.client_lab_results.source IS
  'manual = practitioner typed it off a report; form = submitted lab_results card; self = the client''s own daily reading (glucometer), not a lab draw.';

-- 2. One reading per marker per day.
--
-- Daily self-monitoring means a client will re-enter today's number after
-- correcting a typo, and a double-tap on a phone should not leave two
-- fasting readings on the same date - the chart would show a vertical jump
-- that never happened. Scoped to source='self' so it cannot interfere with
-- lab reports, where two draws on one day are legitimate.
CREATE UNIQUE INDEX IF NOT EXISTS client_lab_results_self_daily_idx
  ON public.client_lab_results (client_id, marker_code, taken_on)
  WHERE source = 'self';
