# Plan — graph enhancements: monthly view, visible values, backdating, BP

Brief received 2026-11-05. Five asks. Two are new work, two are small fixes,
one is already built.

## Scope

| Ask | Finding | Work |
|---|---|---|
| Monthly view on the sugar graph | Chart has `week` / `allTime` only | **New** |
| Values readable without hovering | Recharts tooltip only | **New** |
| Backdate entries freely | **Web already allows it** — the date input has `max` and no `min`. Only mobile is capped to Today / Yesterday / day-before | **Mobile only** |
| Weight graph, both sides | **Already exists** — `ClientDetail` (practitioner) and client `Progress`, X/Y axes | **None** |
| BP graph, both sides | No BP marker anywhere | **New** |

Out of scope: pulse, a weight target field, editing a past reading from the
chart, and customisable extra parameters (a separate open item).

## Decisions

**BP is two markers, one chart.** `bp_systolic` and `bp_diastolic` as ordinary
lab markers drawn as two lines. No new table: the labs module already gives
trends, permissions, self-logging and charting, and a dedicated table would
duplicate all of it. Storing "128/82" as text was rejected — text cannot be
plotted or banded.

**Weight keeps direction-of-travel colouring, not clinical bands.** The brief
says "matching the functionality used for blood sugar", but there is no
universal healthy weight; colouring someone's weight red is a clinical claim
we cannot support, and the existing chart already says so in a comment. BP
*does* have published cut-offs, so BP gets bands. User confirmed both.

**Backdating is unrestricted into the past, capped at today.** A client logging
September readings after joining in November is the stated use case. A future
date is still refused — a reading that has not happened yet is a typo.

## Impact map

- `backend/src/labs/lab-markers.ts` — two markers. Read by the import parser,
  the panel list and both charts. Adding to the array is additive; the risk is
  an alias colliding with an existing marker, so aliases stay BP-specific.
- `backend/src/labs/labs.service.ts` — `SELF_LOGGABLE` gains the two BP codes;
  `SELF_PLAUSIBLE` currently assumes a sugar range (20–600) and must become
  per-marker or BP readings get rejected. **This is the breakage risk.**
- `frontend/.../sugarBands.ts` + `sirah-mobile/src/lib/sugar-bands.ts` —
  duplicated by design, must stay in step.
- `SugarChart.tsx`, `SugarLogCard.tsx`, mobile `blood-sugar.tsx`,
  `sugar-chart.tsx` — period switch, labels, BP series.
- No migration: `client_lab_results` already stores any marker code.

## Edge cases

- BP with only one of the two numbers entered → reject; a systolic without a
  diastolic is not a blood pressure.
- A month with no readings → empty state naming the month, never a zero point.
- Data-point labels on a dense month → thin them, or they overlap into mush.
- Backdated reading on a date that already has one → the existing per-day
  upsert handles it; confirm it still does for BP.

## Build order

1. BP markers + per-marker plausibility (backend; everything else depends on it)
2. Monthly view + always-visible values (web)
3. Mobile: free date picker, monthly view, BP
4. BP entry card, both sides
