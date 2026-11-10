# Changelog

## Blood pressure tracking
- Backend: `bp_systolic`/`bp_diastolic` markers added to `vitals` panel, self-loggable, per-marker plausibility bounds (50–300/30–200 mmHg), bands at 90–120/60–80. 68 labs tests passing.
- Frontend (entry card, chart): not yet built.

## Enterprise plan (quoted, contact sales)
- Fourth pricing card, "Quoted", CTA "Contact sales" -> the existing `/booking-page` flow with `?intent=enterprise`.
- NOT a plan key: `ENTERPRISE_CARD` in `plans.ts` is presentation only, served by `/public/plans` as a sibling of `plans[]`. `sellablePlans()` stays at 3; billing, limits, trial guard and Razorpay untouched.
- `captureSource()` in `LeadForm.tsx` gained `intent`, so the tag reaches `landing_leads.source`. No backend/DTO/migration change — `source` is an open record.
- `prerender.mjs`: Enterprise added to the `/pricing` and `/home` crawlable copy and the `/pricing` meta description (hand-maintained SEO copy would otherwise have shown 3 tiers to crawlers).
- 7 new tests + 132 regression tests pass; all 7 acceptance criteria verified in a real headless Chrome.
- Not done, by design: no in-app Enterprise card (purchase surfaces only), and a closed deal is still set up by hand.
- Follow-up (same day): Enterprise added to the in-app billing page too. `/billing/me/plans` serves it as a sibling of `plans`; rendered as a full-width strip below the plan grid, not a `PlanCard` (that component drives Razorpay checkout). 8 tests, 133 regression tests pass.
