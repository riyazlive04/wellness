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
- Fix: the billing-page Enterprise block was below the plan grid, where the ~600px-tall plan cards hid it entirely. Moved above the grid and compacted to a one-line banner (features moved to the CTA's `title`).
- Enterprise on /billing is now a 4th card in the plan grid (grid `lg:grid-cols-2 xl:grid-cols-4`), mirroring PlanCard's anatomy, instead of a banner. Not a `PlanCard`: that component drives Razorpay checkout.

## feat(admin-video-scripts) — Video scripts in Super Admin · 2026-11-14

The 50 marketing video scripts move from `films/sirah-life/*.md` (readable only
with the repo checked out) into `/admin/video-scripts`, beside Leads and the
demo-call SOP. Editable in the browser, because scripts get revised after every
shoot and a redeploy per wording change is not a usable loop.

**Added**
- `supabase/migrations/20261114090000_video_scripts.sql` — `video_scripts` table, platform-owned (no `workspace_id`), RLS deny-all, status check, jsonb-array guard on `lines`, `updated_at` trigger.
- `backend/src/admin/admin-video-scripts.controller.ts` — 6 routes, all `@SuperAdmin()` + `@Audit()`. Import upserts on `number`, so re-running is idempotent and never deletes.
- `frontend/src/pages/sirah/admin/AdminVideoScripts.tsx` — bucket rail, search across VO text, length/status filters, in-place line editing, copy-VO.
- `scripts/parse-video-scripts.mjs` + `.test.mjs` — markdown to import payload, 12 tests.
- Prisma model `video_scripts`; nav item in Operations; route in `App.tsx`.

**Fixed (content, before import)**
- Brand: 44x "SIRAH LIFE" to NUSI and 43x sirahlife.com to nusi.in across the script library. The shipped product has never been called SIRAH LIFE.
- Script 47 quoted a 10-client / 2-team trial; the real `TRIAL_LIMITS` is 50 clients / 5 team / 500 AI credits / 1 GB.
- Script 22 on-screen top-up prices corrected to 999/1k, 4,499/5k, 15,999/20k.

**Verified**
- "The trial carries the Growth feature set" is true: `common/features.ts:119` sets `trial: GROWTH_FEATURES`. Both film briefs updated from `[?]` to verified.

**Known limitations**
- No soft delete in v1; the markdown originals in the repo are the backup.
- Last-write-wins on concurrent edits (2-3 person internal tool); `updated_at` is shown so a surprise is visible.
- Migration not yet applied, so acceptance criteria 1, 2 and 4-10 are unverified.
