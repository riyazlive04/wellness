# Product Video Brief — NUSI · Film 05 "Audit Your Own Practice"

Filled from the codebase on 2026-11-14. Sources cited as **[src]**.
**`[?]` marks the only fields a human must supply.** Everything else is verified from the repo.

**Funnel role:** top of funnel / problem awareness. This is the film that creates the wound.
It is paired with **Film 50 "The Close"** (`films/nusi-50-close/`), which closes it. Run 05 first, 50 to anyone who watched past 50%.

**Strategic note (why this script, in Brunson's terms):** the viewer is never told they have a problem. They are asked five questions they cannot answer, and they diagnose themselves. Self-diagnosis survives scepticism in a way a claim does not — which matters because the buyer is a clinician and clinicians distrust being sold to.

---

## 1. Product

| Field | | Your answer |
|---|---|---|
| Product name **[R]** | Exactly as on screen | **NUSI** — all caps. *[src: `frontend/index.html` title; 12 occurrences of "NUSI" vs 0 of "SIRAH LIFE" in the shipped frontend]* ⚠️ The script library in `films/sirah-life/` says "SIRAH LIFE" throughout — that is **not** the shipped brand. Every VO line below has been corrected to NUSI. |
| How it's pronounced **[R]** | | **"NOO-see"** — `[?]` confirm. Without this a voice engine reads the caps as "N-U-S-I". Must be settled before any TTS pass. |
| One-line description **[R]** | | Practice management software for nutritionists and dietitians in India — meal plans, a branded client app, daily tracking and GST billing in one subscription. *[src: meta description]* |
| Tagline / campaign line **[R]** | End card | **"Run your practice, not your admin."** *[src: `frontend/src/pages/site/Home.tsx:84-86`]* |
| Website **[R]** | | https://nusi.in |
| Call-to-action URL **[R]** | | https://nusi.in/auth?mode=signup |
| Call-to-action text **[R]** | | **"Start free trial — 14 days, no card needed"** *[src: `Home.tsx:95,101`]* |

## 2. Audience and goal

| Field | | Your answer |
|---|---|---|
| Who is watching **[R]** | | Practice owners — solo nutritionists through multi-coach clinics. India first. *[src: `FEATURES.md`, "Target customers"]* |
| The one pain point **[R]** | | She cannot answer basic questions about her own practice without opening five tools, so she manages by memory and finds out about problems from refund requests. |
| The one takeaway **[R]** | | "I am running a clinic without instruments." |
| Where it will be shown **[O]** | | Paid social (cold), YouTube pre-roll, webinar opener, website. `[?]` confirm — decides the 9:16 cut. |

## 3. Format

| Field | | Your answer |
|---|---|---|
| Length **[R]** | | **150 s master.** Cuts to 90 s (drop scenes 17–18) and 60 s (questions + reveal + close only). See `SHOTLIST.md` cut markers. |
| Pace **[R]** | | Calm, deliberate, confident. The five questions **must** hold their silence — the pauses are the mechanism. Resist any edit that tightens them. |
| Aspect ratio **[O]** | | 16:9 at 1920×1080 master, **plus 9:16** for Reels/Shorts. The question cards are centred text, so they reframe cleanly. |
| Language(s) **[R]** | | English v1. **Tamil is a real candidate** — the app ships a `ta` locale. `[?]` decide. |
| Captions **[O]** | | `captions.srt` supplied. **Burn in** for social autoplay — this film opens on silence and a muted viewer sees nothing otherwise. |

## 4. Brand assets

| Field | | Your answer |
|---|---|---|
| Logo file path **[R]** | | `frontend/public/nusi-mark.png` (mark only, for the reveal) and `frontend/public/nusi-logo.png` (full lockup, end card). ⚠️ `[?]` **Alpha channel and pixel width unverified — I did not open the files.** Repo-root `nusi_LOGO.jpeg` is unusable (JPEG, no alpha). |
| Brand colours **[R]** | | Primary **#436F17**. Gradient **#375818 → #436F17 → #558E19**. Pale tint **#F3FAE8**, edge **#E4F4CC**. Dark canvas **#0A0C10**. *[src: `Home.tsx:11-14`; `index.html` theme-color]* |
| Fonts **[O]** | | **Plus Jakarta Sans**, 400–800. OFL, commercially clear. *[src: `index.html` font link; `tailwind.config.ts`]* |
| Real UI screenshots **[O]** | | `frontend/public/landing/problem-{at-risk,plate-vision,daily-tasks,appointments,diet-templates,client-chat}.webp` — already shipped and already the screens the landing page sells. Redraw from these. |
| Light or dark product UI **[O]** | | **Dark** for the five questions (#0A0C10) → **light** product screens from the reveal onward. The tonal flip is the turn in the film. |

## 5. Voice-over

| Field | | Your answer |
|---|---|---|
| Voice **[R]** | | `[?]` **Required — cannot be invented.** Indian-English female, mid-30s, to match the buyer. Needs an ElevenLabs name + ID. |
| Tone **[R]** | | A peer who has run a practice. Never an announcer. The first line is almost conversational. |
| Speed **[O]** | | **0.95** — slower than the house default. This film is built on pauses. |
| Your own recording **[O]** | | A real practitioner reading this would outperform TTS. Worth considering. |

## 6. Script

Full narration in `VO.txt` (TTS-ready). Shot-by-shot with durations and asset paths in `SHOTLIST.md`. On-screen text in `ONSCREEN.md`. Timed captions in `captions.srt`.

## 7. Verified claims used in this film

Every number spoken in this film traces to source. Re-verify before any reshoot.

| Claim in VO | Verified value | Source |
|---|---|---|
| Starter ₹3,999/mo | `priceInr: 3999` | `backend/src/billing/plans.ts:120` |
| Growth ₹8,999/mo | `priceInr: 8999` | `plans.ts:153` |
| Scale Pro ₹19,999/mo | `priceInr: 19999` | `plans.ts:183` |
| Starter 100 clients | `maxClients: 100` | `plans.ts` Starter limits |
| Growth 500 clients / 5 team / 5,000 AI | `maxClients: 500, maxTeam: 5, aiCallsPerMonth: 5000` | `plans.ts:177` |
| Scale Pro unlimited / 25,000 AI | `maxClients: null, aiCallsPerMonth: 25000` | `plans.ts:208` |
| Trial 14 days | Trial gate | `plans.ts:26` |
| IFCT-2017, 15 methods, 48 retention factors | Food library | `FEATURES.md` §3 Nutrition |
| GST invoices, Razorpay, dunning, 14-day grace | Billing engine | `FEATURES.md` §2 |

### ⚠️ Corrections applied to the original script

The source script in `films/sirah-life/SCRIPTS_01-15.md` contained three errors. All are fixed in `VO.txt`:

1. **Brand** — said "SIRAH LIFE"; the shipped product is **NUSI**.
2. **Trial limits** — said "10 clients / 2 team"; actual is **50 clients / 5 team / 500 AI credits / 1 GB** *[src: `TRIAL_LIMITS`, `plans.ts:259-266`]*. This film no longer states trial seat counts at all (Film 50 does).
3. **Trial feature set** — the script claimed the trial carries "the Growth feature set". `TRIAL_LIMITS` sets *quotas* only; it does not prove feature entitlement. ✅ **VERIFIED 2026-11-14:** `common/features.ts:119` sets `trial: GROWTH_FEATURES` — the trial genuinely carries the Growth feature set. The claim is safe to speak.

### Claims deliberately NOT made

- No client weight-loss or health-outcome claims. The film sells instrumentation, not medical results.
- No "revolutionary / seamless / cutting-edge". Hormozi rule: numbers, nouns, verbs.
- No fake scarcity or countdown. Urgency in this funnel comes from the viewer's own unanswered questions.
