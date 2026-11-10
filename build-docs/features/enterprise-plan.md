# Enterprise plan (quoted, contact sales)

Status: BUILT — all 7 acceptance criteria verified
Date: 2026-11-10

## Purpose

Clinics and chains above Scale Pro ask for negotiated limits and a contract.
Today the pricing page ends at Scale Pro (₹19,999), so those buyers either
self-serve into the wrong tier or leave. Enterprise gives them a fourth card
with no price and one action: book a call with the team.

## Decision: marketing card only (approved 2026-11-10)

Enterprise is NOT a plan key. It is a card on the public pricing page whose CTA
routes into the booking flow that already exists.

Why not a real plan key:
- `PlanKey` drives `limitsForPlan()`, Razorpay plan ids, TrialGuard and the
  upgrade/checkout path. A key with no price and no `razorpay_plan_id` would
  need a "not self-serve" branch in every one of those.
- Nothing can be bought until a human quotes it, so the buy path adds no value.
- When a deal closes, sales already has a path: set the workspace to
  `scale_pro` and negotiate off-platform (same as the existing
  `billing_exempt` demo workspace handling).

Consequence accepted: a closed Enterprise deal is still billed manually. If
that becomes frequent, the upgrade is a `workspace_quotes` table — out of scope.

## Architecture

Three touched files, no new modules, no migration, no backend change.

1. `backend/src/billing/plans.ts`
   `export const ENTERPRISE_CARD` — a presentation-only const (name, price
   label "Quoted", tagline, promise, features[]). NOT added to `PLANS`, so
   `sellablePlans()`, `findPlan()`, `limitsForPlan()` and the whole billing
   path are untouched by construction.

2. `backend/src/billing/public-plans.controller.ts`
   Returns `enterprise: ENTERPRISE_CARD` as a sibling of `plans`, not an entry
   inside it. The pricing page must never iterate it as a buyable plan.

3. `frontend/src/pages/site/Pricing.tsx`
   Renders the card as a 4th column (grid goes `sm:grid-cols-2
   lg:grid-cols-4`). CTA is `Link to="/booking-page?intent=enterprise"`,
   labelled "Contact sales", styled as the outline (non-recommended) button.

4. `frontend/src/pages/sirah/landing/LeadForm.tsx`
   `captureSource()` gains `intent` to its existing key list. `source` is an
   open `Record<string, unknown>` in the lead DTO, so the tag reaches the leads
   table with no backend or migration change. Sales filters on it.

## Data flow

visitor → /pricing → "Contact sales" → /booking-page?intent=enterprise
  → existing LeadForm (WhatsApp OTP + SlotPicker)
  → POST /api/v1/public/leads { ..., source: { intent: 'enterprise', utm_* } }
  → landing_leads row, WhatsApp confirmation, Google Calendar hold
  → sales sees intent=enterprise on the lead

## Impact map

| Touched | Risk | Mitigation |
|---|---|---|
| `plans.ts` | A const added near `PLANS` could be pulled into it by a later edit | It sits below `TOPUPS`, not adjacent to `PLANS`; comment states why |
| `public-plans.controller.ts` | Pricing page breaks if `plans` shape changes | Enterprise is a sibling key; `plans[]` shape unchanged |
| `Pricing.tsx` | 3-col → 4-col grid reflows on tablet | `sm:grid-cols-2 lg:grid-cols-4`; verify at 375/768/1280 |
| `LeadForm.tsx` | `captureSource` also feeds the hero form | Adding a key is additive; absent param = key absent, as today |
| `prerender.mjs` | SEO snapshot of /pricing must include the card | Deploy runs prerender after build (see project MEMORY) |
| `limitsForPlan`, TrialGuard, Razorpay, `planCapabilities.ts` | None — no new key | Asserted by test: `findPlan('enterprise') === undefined` |

5. `frontend/src/pages/sirah/owner/Billing.tsx` (added 2026-11-10, after
   review) — the in-app billing page. The original plan left this out as "a
   purchase surface"; that was wrong. `/billing` is precisely where a paying
   Scale Pro customer hits "Unlimited clients" and has no way to ask for more,
   so it is the best upgrade conversation in the product.

   It is NOT a `PlanCard`: that component takes `currentKey`, `pending`,
   `onSelect` and drives Razorpay checkout, so threading a priceless tier
   through it would need a null-guard in every prop. A separate full-width
   strip after the plan grid instead, reusing the page's own card styling.
   `/billing/me/plans` serves `enterprise` as a sibling of `plans`, exactly as
   the public endpoint does.

Still not touched, deliberately: `StepPlan` (onboarding). A brand-new signup
choosing their first plan is not an enterprise buyer, and that step gates
onboarding progress.

## Edge cases and failure modes

- `/public/plans` fails → pricing page already shows "Couldn't load prices".
  Enterprise rides that same state; it must not render while `plans` is empty.
- Someone adds `enterprise` to `PLANS` later → `limitsForPlan('enterprise')`
  returns its limits and Razorpay checkout 500s on a missing plan id.
  Guarded by a test asserting it is not sellable.
- `?intent=` arrives with junk/overlong input → `captureSource()` already
  `.slice(0, 200)`s every value. No new validation surface.
- Direct hit on `/booking-page` with no param → `intent` key simply absent.
- Enterprise card bullets drift from what sales actually offers → copy lives in
  one const, server-side, so it is one edit.

## Acceptance criteria

1. `/pricing` shows 4 cards; the 4th reads "Enterprise", price "Quoted", no
   `/month` or `/year` suffix, and no setup-fee line.
2. The monthly/yearly toggle does not change anything in the Enterprise card.
3. Its button says "Contact sales" and navigates to
   `/booking-page?intent=enterprise`.
4. Submitting that booking form sends `source.intent === 'enterprise'`.
5. `findPlan('enterprise')` is `undefined` and `sellablePlans()` has length 3.
6. `GET /api/v1/public/plans` returns `data.plans.length === 3` and a non-null
   `data.enterprise`.
7. Layout holds with no horizontal scroll at 375px, 768px and 1280px.
8. `GET /api/v1/billing/me/plans` returns 3 plans and a non-null `enterprise`,
   and the in-app billing page shows the Enterprise strip below the plan grid
   with the same "Contact sales" CTA.

## Tests

- `plans.spec.ts`: criteria 5 (enterprise is not sellable, not resolvable).
- `public-plans.controller.spec.ts`: criterion 6.
- `LeadForm` source capture: criterion 4.
- 1, 2, 3, 7 verified by running the page.

## Built — deviations from the plan

- **`prerender.mjs` also had to change.** It was in the impact map as "verify",
  but it turned out to hand-maintain a *copy* of the pricing text, so crawlers
  would have kept seeing three tiers. Enterprise was added to the `/pricing`
  and `/home` crawlable copy and to the `/pricing` meta description.
- **No frontend unit test.** This repo has no frontend test runner at all;
  adding vitest + testing-library + jsdom for one card was disproportionate.
  Criteria 1, 2, 3, 4 and 7 were verified instead by driving the running app in
  headless Chrome over CDP. Those scripts are throwaway, so re-verifying after
  a change to this card means re-running the app and re-checking by hand.
- `.env.local` proxies the dev server to **production**, so verifying locally
  needs `VITE_PROXY_TARGET=http://localhost:3001` or the page reads live data
  and the new card never appears.

## Card copy (shipped)

    Enterprise
    Quoted
    For chains, hospitals and franchise groups

    Unlimited clients and team
    Negotiated AI actions a month
    Negotiated storage
    ✓ Multi-branch and franchise dashboard
    ✓ White-label apps and custom domain
    ✓ Dedicated success manager and onboarding
    ✓ Priority SLA and security review
    ✓ Custom contract and invoicing

    [ Contact sales ]
