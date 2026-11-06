# Monthly view and on-chart values

## Purpose
From the 2026-11-05 brief: coaches review sugar charts constantly and did not
want to hover for every value, and wanted month-by-month rather than only
week or all-time.

## Architecture
Month mode is the existing all-time branch narrowed by `takenOn.startsWith(month)`.
No new data path. `sugarMonths()` lists months with readings; empty months are
skipped in navigation, as empty weeks already are, but gaps WITHIN a shown
month still render as gaps.

Flags stay annotated over the FULL history before the month filter, so a
reading on the 1st keeps its baseline from the previous month. A month
boundary is a UI fact, not a clinical one.

## On-chart values
`LabelList` per series, with two limits:
- single-marker view only — several lines together collide with each other
- every Nth label on long ranges (1 / 2 / 3 by row count) — thirty labels on
  one line overlap into a smear

The tooltip still gives the exact value for any point.

## Verified
- months listed oldest-first, empty months skipped
- October filter returns exactly October's rows
- axis shows the day number, not "5 Nov" thirty times
- real typecheck (`npm run typecheck` → `tsc --build`) passes

## Not done
Mobile month view — step 3.
