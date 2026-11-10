# Testing

## Strategy
Per-feature tests mapped to that feature's acceptance criteria and edge cases (see `build-docs/features/<feature>.md`). Run the feature's tests plus every feature in its impact map on each change. Never weaken/skip a test to make it pass — fix the root cause, or justify in this file if the test itself was wrong.

## Results by feature

### Blood pressure tracking (`features/blood-pressure.md`)
- Backend: 68 labs tests, 781 total, all pass.
- Found: `SELF_LOGGABLE` growing to include BP broke two existing tests that assumed every member was glycaemic/mg/dL — those assertions were scoped down to the sugar markers (correct fix, not a weakened test).
- Frontend (entry card, chart): not yet implemented — no tests yet.

### Enterprise plan (`features/enterprise-plan.md`)
- Backend: `enterprise-not-sellable.spec.ts`, 7 tests — criteria 3, 5, 6 (not resolvable as a plan key, catalogue stays at 3 tiers, falls back to trial limits, no Razorpay id, endpoint serves it beside `plans`, CTA carries the intent).
- Regression (impact map): 132 tests across `src/billing`, `src/tenancy/limits.service.spec.ts`, `src/auth/guards/trial.guard.spec.ts` — all pass. Frontend `tsc --noEmit` clean.
- Criteria 1, 2, 3, 4, 7 verified by driving the running app in headless Chrome (CDP): 4 cards in order Starter/Growth/Scale Pro/Enterprise; "Quoted" with no /month or /year suffix and no setup-fee line; yearly toggle changes Starter but leaves Enterprise byte-identical (control asserted, so a dead toggle cannot pass it); CTA resolves to `/booking-page?intent=enterprise` and `captureSource()` emits `{"intent":"enterprise"}`; no horizontal scroll at 375/768/1280.
- Found while testing: `prerender.mjs` duplicates the pricing copy by hand, so crawlers would have kept seeing 3 tiers. Fixed in the same change (it was in the feature doc's impact map).
- Note: no frontend test runner exists in this repo. Adding vitest + testing-library + jsdom for one card was rejected as disproportionate; the browser checks above are scripted and repeatable from `build-docs/features/enterprise-plan.md`.
- Follow-up (in-app billing page): criterion 8 added — `enterprise-not-sellable.spec.ts` now asserts the signed-in `/billing/me/plans` also returns 3 plans with Enterprise as a sibling. 8 tests, 133 regression tests pass, frontend typecheck and `vite build` clean.
- The Enterprise strip's markup WAS then rendered in headless Chrome against the live catalogue (throwaway harness, since deleted): 8 bullets, "Quoted" badge, CTA `/booking-page?intent=enterprise`, and no horizontal scroll at 375/768/1440.
- Remaining gap: that exercised the strip's markup and data, not the `/billing` page itself mounting it. `/billing` needs a signed-in session and the local backend has no `.env`/database (`public.practice_onboarding` does not exist), so the route redirects to sign-in. The integration is covered by typecheck, a clean `vite build`, and asserting all eight `enterprise.*` bindings are present in the emitted `Billing-*.js` chunk — but the strip has never been seen in place on a real workspace. Worth one manual look after deploy.
