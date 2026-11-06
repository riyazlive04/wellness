# Testing

## Strategy
Per-feature tests mapped to that feature's acceptance criteria and edge cases (see `build-docs/features/<feature>.md`). Run the feature's tests plus every feature in its impact map on each change. Never weaken/skip a test to make it pass — fix the root cause, or justify in this file if the test itself was wrong.

## Results by feature

### Blood pressure tracking (`features/blood-pressure.md`)
- Backend: 68 labs tests, 781 total, all pass.
- Found: `SELF_LOGGABLE` growing to include BP broke two existing tests that assumed every member was glycaemic/mg/dL — those assertions were scoped down to the sugar markers (correct fix, not a weakened test).
- Frontend (entry card, chart): not yet implemented — no tests yet.
