# Per-day nutrition graphs

## Purpose
2026-11-06 brief: show calories per day from when the client started rather
than one average, do the same for protein, combine calories with weight so a
coach can see whether a calorie level moved the scale, and print values on
the chart instead of behind a hover.

## What was already there
The endpoint ALREADY returned per-day rows including total_protein_g. The
screen reduced them to one "Avg kcal/day" tile and a 14-day bar strip, so the
per-day numbers were fetched and discarded, and protein was never drawn.

## Changes
- `workspaceClientNutritionTrends` day cap 90 -> 365, matching habits.
  90 silently truncated anyone on a longer programme.
- Hand-rolled bar strip replaced with a Recharts ComposedChart: calories as
  bars on a left axis, weight as a line on a RIGHT axis. Separate axes are
  the point - calories 1200-2500 against weight 60-90 would flatten the
  weight line onto the floor.
- Protein gets its own chart; grams share no axis with kcal.
- Values printed via LabelList, capped at ~10 labels by count not step (the
  fixed-step version collided on long ranges; learned on the sugar charts).
- Range switch 30d / 3m / All, defaulting to All.

## Decisions
**No start date exists.** Clients have only created_at - when the RECORD was
made, not when the programme began - and meals are routinely backdated before
it. So the range is a choice and the heading names the first day with data.

**Only days with a meal become rows.** A weigh-in on a day nobody logged food
would draw a zero calorie bar, which reads as "ate nothing" rather than "did
not log".

**Weight gaps stay gaps.** Clients eat daily and weigh weekly;
connectNulls=false, with a line of text saying so under the chart.

## Verified
Join tested: rows oldest-first, weight attached only where it exists, a
meal-less weigh-in excluded, labels capped at 10 from 3 to 365 days.
Frontend typecheck (tsc --build) and backend tsc clean.
