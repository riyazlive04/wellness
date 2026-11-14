# Product Video Brief — NUSI · Film 50 "The Close"

Filled from the codebase on 2026-11-14. Sources cited as **[src]**.
**`[?]` marks the only fields a human must supply.** Everything else is verified from the repo.

**Funnel role:** bottom of funnel. This film closes the wound that **Film 05 "Audit Your Own Practice"** (`films/nusi-05-audit/`) opened.

⚠️ **Never run this film to cold traffic.** Scene 1 opens with "If you have come this far, you already agree with the diagnosis" — which is false and confusing to anyone who has not seen Film 05. Audience: viewers who watched Film 05 past 50%, site visitors who hit `/pricing` without signing up, and abandoned-signup retargeting.

**Strategic note (why this script, in Hormozi's terms):** the film executes a grand slam offer in sequence — stack the value until the price looks small, then *name the buyer's real risk out loud* before they can, then dismantle it, then reframe the trial as an experiment the buyer runs rather than a product they try. Naming the objection yourself is what buys the credibility to answer it.

---

## 1. Product

| Field | | Your answer |
|---|---|---|
| Product name **[R]** | Exactly as on screen | **NUSI** — all caps. *[src: `frontend/index.html`; 12 occurrences of "NUSI" vs 0 of "SIRAH LIFE" in the shipped frontend]* ⚠️ The source script library in `films/sirah-life/` says "SIRAH LIFE" throughout — **not** the shipped brand. Corrected in `VO.txt`. |
| How it's pronounced **[R]** | | **"NOO-see"** — `[?]` confirm. Must match Film 05 exactly; the two films run in one sequence. |
| One-line description **[R]** | | Practice management software for nutritionists and dietitians in India — meal plans, a branded client app, daily tracking and GST billing in one subscription. *[src: meta description]* |
| Tagline / campaign line **[R]** | End card | **"Run your practice, not your admin."** *[src: `Home.tsx:84-86`]* |
| Website **[R]** | | https://nusi.in |
| Call-to-action URL **[R]** | | https://nusi.in/auth?mode=signup |
| Call-to-action text **[R]** | | **"Start free trial — 14 days, no card needed"** *[src: `Home.tsx:95,101`]* |

## 2. Audience and goal

| Field | | Your answer |
|---|---|---|
| Who is watching **[R]** | | Warm only. Has seen Film 05, or visited pricing, or abandoned a signup. Already agrees they have a problem; has not acted. |
| The one pain point **[R]** | | Not the product — the *decision*. She believes it would help and still will not start, because the real fear is sinking a fortnight into a tool she abandons. |
| The one takeaway **[R]** | | "I can test this with 10 clients and risk nothing." |
| Where it will be shown **[O]** | | Retargeting (Meta/Google), email sequence final step, sales-call follow-up. `[?]` confirm. |

## 3. Format

| Field | | Your answer |
|---|---|---|
| Length **[R]** | | **150 s master.** Cuts to 90 s (drop scenes 4–11, keep diagnosis + risk + reversal + close) and 45 s (risk reversal + experiment + close only — scenes 13–23). |
| Pace **[R]** | | Balanced and direct. Faster than Film 05. This is a closing argument, not a diagnosis — momentum matters, but never hype. |
| Aspect ratio **[O]** | | 16:9 at 1920×1080 master, **plus 9:16** for retargeting placements. |
| Language(s) **[R]** | | English v1. Must match Film 05's language choice. `[?]` |
| Captions **[O]** | | `captions.srt` supplied. **Burn in for social** — retargeting plays muted. |

## 4. Brand assets

| Field | | Your answer |
|---|---|---|
| Logo file path **[R]** | | `frontend/public/nusi-logo.png` (end card), `frontend/public/nusi-mark.png` (watermark). ⚠️ `[?]` **Alpha channel and pixel width unverified.** Repo-root `nusi_LOGO.jpeg` unusable (no alpha). |
| Brand colours **[R]** | | Primary **#436F17**. Gradient **#375818 → #436F17 → #558E19**. Pale tint **#F3FAE8**, edge **#E4F4CC**. Dark canvas **#0A0C10**. *[src: `Home.tsx:11-14`]* |
| Fonts **[O]** | | **Plus Jakarta Sans**, 400–800. OFL. *[src: `index.html`; `tailwind.config.ts`]* |
| Real UI screenshots **[O]** | | `frontend/public/landing/problem-{diet-templates,client-chat,at-risk,plate-vision,daily-tasks,appointments}.webp` — all six are used in this film. |
| Light or dark product UI **[O]** | | **Light product screens** dominate. Dark only for the three text-on-black argument frames (scenes 1, 13, 19). Inverse of Film 05's weighting — this film is in the solution, not the problem. |

## 5. Voice-over

| Field | | Your answer |
|---|---|---|
| Voice **[R]** | | `[?]` **Must be the same voice and ID as Film 05.** A voice change between the two films breaks the sequence. |
| Tone **[R]** | | Direct, unhurried, slightly warmer than Film 05. The register of someone making a fair offer, not pushing. Scenes 13–20 especially: candid, almost casual. |
| Speed **[O]** | | **1.0** (Film 05 runs 0.95 — this film is deliberately a touch quicker). |
| Your own recording **[O]** | | Same consideration as Film 05, and same person. |

## 6. Script

Narration in `VO.txt` (TTS-ready). Shot-by-shot in `SHOTLIST.md`. On-screen text in `ONSCREEN.md`. Timed captions in `captions.srt`.

## 7. Verified claims used in this film

| Claim in VO | Verified value | Source |
|---|---|---|
| Starter ₹3,999/mo | `priceInr: 3999` | `backend/src/billing/plans.ts:120` |
| Growth ₹8,999/mo | `priceInr: 8999` | `plans.ts:153` |
| Scale Pro ₹19,999/mo | `priceInr: 19999` | `plans.ts:183` |
| Annual = 2 months free | `priceInrAnnual: 39999 / 89999 / 199999` vs 12× monthly | `plans.ts:121,154,184` |
| Trial 14 days, no card | Trial gate | `plans.ts:26` |
| Versioned program assignments, auto-sync, history preserved | Program Engine | `FEATURES.md` §3 Programs |
| IFCT-2017, 15 methods, 48 retention factors | Food library | `FEATURES.md` §3 Nutrition |
| Dunning + 14-day grace before downgrade | Billing engine | `FEATURES.md` §2 |
| Audit log, API keys, white-label = Scale Pro | Feature entitlement map | `FEATURES.md` §2 |

### ⚠️ Corrections applied to the original script

The source script in `films/sirah-life/SCRIPTS_41-50.md` contained three errors. All fixed in `VO.txt`:

1. **Brand** — said "SIRAH LIFE"; shipped product is **NUSI**.
2. **Credit top-up prices** — the script library states ₹3,999 / 5k and ₹9,999 / 20k. Actual: **₹999 / 1k, ₹4,499 / 5k, ₹15,999 / 20k** *[src: `plans.ts:294,303,314`]*. This film no longer quotes top-up prices at all.
3. **"The trial carries the Growth feature set"** — `TRIAL_LIMITS` *[src: `plans.ts:259-266`]* sets quotas (50 clients, 5 team, 500 AI credits, 1 GB) but says nothing about feature entitlement. ✅ **VERIFIED 2026-11-14:** `common/features.ts:119` sets `trial: GROWTH_FEATURES`, so the claim is true. `VO.txt` scene 16 is phrased to state only what is verified: that the trial is not a crippled demo and runs real limits. If entitlement is confirmed, the stronger line is in `ONSCREEN.md` as an alternate.

### The "ten clients" experiment — a note on honesty

Scene 17 proposes testing with 10 clients. The trial allows **50** *[src: `TRIAL_LIMITS.maxClients`]*, so 10 is a deliberately conservative ask, not a limit. This is correct Hormozi practice — lower the activation energy below what the product permits. Do **not** let an editor "upgrade" this to 50 to sound more generous; the small number is what makes the offer feel safe.

### Claims deliberately NOT made

- No client health or weight-loss outcomes.
- No fake deadline, countdown or bonus expiry. The urgency in scene 21 is the buyer's own churn, which is real.
- No competitor named or logo shown.
- No "revolutionary / seamless / cutting-edge".
