# Blood pressure tracking

## Purpose
Clients record BP at home like sugar; both sides see the trend. Asked for in
the 2026-11-05 brief alongside monthly views and free backdating.

## Architecture
Two lab markers, `bp_systolic` and `bp_diastolic`, in a new `vitals` panel.
No new table: `client_lab_results` already stores any marker code, and the
labs module already provides trends, permissions, self-logging and charting.

Rejected: one marker holding "128/82" (text cannot be plotted or banded) and
a dedicated BP table (duplicates the labs module for no gain).

## Rules
- Both numbers or neither. Half a reading is not a blood pressure.
- Diastolic must be below systolic — otherwise the boxes were filled in the
  wrong order, which is the common mistake.
- Plausible 50–300 / 30–200 mmHg. Wide on purpose: refusing 190 would block
  the reading that most needs recording. It is a typo filter, not triage.
- Bands 90–120 / 60–80, the published adult normal range.

## Impact
- `SELF_LOGGABLE` grew, which broke two existing tests that looped over it
  asserting every member was glycaemic and mg/dL. Those assertions were right
  about sugar and wrong once BP joined; scoped to the sugar markers.
- The controller DTO repeated the allowlist as a literal. It now reads
  `SELF_LOGGABLE`, so the two cannot drift again.
- Aliases checked against every existing marker — no collisions.

## Acceptance criteria
- [x] Both markers exist, `vitals` panel, mmHg
- [x] Client can self-log them
- [x] 190/120 accepted; 1280 refused
- [x] Half a reading refused; reversed reading refused
- [x] Entry card and chart, both sides

## Frontend
No new components. SugarChart and SugarLogCard take a `markers` prop
defaulting to the sugar set, so BP reuses the bands, spike detection, weekly
and monthly views and the entry card. Each gets its OWN chart - mmHg and
mg/dL on one y-axis would draw a diastolic of 80 level with a hypo.

Three things had to stop being sugar-specific along the way:
- the spike margin (a glucose 10 mg/dL flagged ordinary BP variation)
- four hardcoded "mg/dL" strings and a `'fbs'` y-axis fallback
- the reference-note disclaimer, now chosen by marker set

## Mobile
The 662-line sugar screen became `ReadingsScreen`, taking a marker set and
four strings. `blood-sugar.tsx` keeps the default export (route unchanged);
`blood-pressure.tsx` is a 20-line wrapper. Separate screens, not one with a
toggle, for the same axis reason as web.

`sugar-bands.ts` was 95 lines behind its web twin. Ported: BP markers, bands,
per-marker spike margins, MARKER_UNIT and the BP disclaimer. Verified the two
copies agree on all four spike constants and produce identical band and flag
output for the same input.

## Status
Done on web and mobile. 781 backend tests pass; both typechecks clean.
