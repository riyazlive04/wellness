# Product Video Brief — NUSI

Filled from the codebase on 2026-11-06. Sources cited as **[src]**.

**`[?]` marks the only fields a human must supply.** Everything else is verified from the repo.

---

## 1. Product

| Field | | Your answer |
|---|---|---|
| Product name **[R]** | Exactly as on screen | **NUSI** — all caps. *[src: `frontend/index.html` title, apple-mobile-web-app-title]* |
| How it's pronounced **[R]** | | **"NOO-see"** — `[?]` confirm. Could also be "NYOO-zee". Voice engines will spell out "N-U-S-I" from the caps otherwise, so this must be settled. |
| One-line description **[R]** | | Practice management software for nutritionists and dietitians in India — meal plans, a branded client app, daily tracking and GST billing in one subscription. *[src: meta description]* |
| Tagline / campaign line **[R]** | End card | **"Run your practice, not your admin."** *[src: landing h1, `frontend/src/pages/site/Home.tsx:84`]* |
| Website **[R]** | | https://nusi.in *[src: og:image domain]* |
| Call-to-action URL **[R]** | | https://nusi.in/auth?mode=signup — the primary landing CTA. Secondary: `/booking-page` ("Book a walkthrough"). |
| Call-to-action text **[R]** | | **"Start free trial — 14 days, no card needed"** *[src: `Home.tsx:95,101`]* |

## 2. Audience and goal

| Field | | Your answer |
|---|---|---|
| Who is watching **[R]** | | Solo nutritionists and dietitians, online coaches, wellness studios, multi-branch nutrition clinics — India first. *[src: `FEATURES.md`, "Target customers"]* |
| The one pain point **[R]** | | She trained as a nutritionist but spends her evenings as an administrator: retyping the same diet chart, hunting a client's question in her personal WhatsApp, chasing payments at month end. *[src: `BEFORE_AFTER`, `Home.tsx:34-40`]* |
| The one takeaway **[R]** | | One subscription replaces the five tools — and the client app carries her name, not NUSI's. |
| Where it will be shown **[O]** | | Website hero, paid social, sales walkthrough. `[?]` confirm — decides whether the 9:16 cut is needed. |

## 3. Format

| Field | | Your answer |
|---|---|---|
| Length **[R]** | | **90 s master.** Fits problem + 6 features + close; cuts to 60 s and 30 s from the same script. `[?]` confirm. |
| Pace **[R]** | | Calm and cinematic at the open, balanced through the features. Not a trailer — the buyer is a clinician, and hype reads as untrustworthy. |
| Aspect ratio **[O]** | | 16:9 at 1920×1080, **plus a 9:16 cut** if paid social is in scope. |
| Language(s) **[R]** | | English for v1. **Tamil is a genuine second candidate** — the app already ships a `ta` locale (`frontend/src/i18n/locales/ta/`), so that audience is already being served. `[?]` decide. |
| Captions **[O]** | | Separate `.srt` (default). Add burn-in if it runs on social autoplay. |

## 4. Brand assets

| Field | | Your answer |
|---|---|---|
| Logo file path **[R]** | | `frontend/public/nusi-logo.png` (full lockup, 258 KB) and `frontend/public/nusi-mark.png` (mark only, 345 KB — use for the reveal). ⚠️ `[?]` **Transparency and pixel width unverified — I did not open the files.** The repo-root `nusi_LOGO.jpeg` is a JPEG and therefore unusable (no alpha channel). |
| Brand colours **[R]** | | Primary **#436F17** (logo leaf green). Gradient **#375818 → #436F17 → #558E19**. Pale tint **#F3FAE8**, edge **#E4F4CC**. Dark canvas **#0A0C10**. *[src: `Home.tsx:11-14`; `tailwind.config.ts` teal scale; `index.html` theme-color]* |
| Fonts **[O]** | | **Plus Jakarta Sans**, weights 400–800 — the app's actual typeface, Google Fonts / OFL, so commercially clear. Not Inter. *[src: `index.html` font link; `tailwind.config.ts` fontFamily]* |
| Real UI screenshots **[O]** | | Already shipped, and they are the exact screens the landing page sells: `frontend/public/landing/problem-{diet-templates,client-chat,at-risk,plate-vision,daily-tasks,appointments}.webp`. Redraw from these. |
| Light or dark product UI **[O]** | | Dark opening (#0A0C10) → light product screens. Matches the app: default theme is a white canvas with green accents. |

## 5. Voice-over

| Field | | Your answer |
|---|---|---|
| Voice **[R]** | | `[?]` **Required — cannot be invented.** Suggest an Indian-English female voice, mid-30s, to match the buyer. Needs an ElevenLabs name + ID. |
| Tone **[R]** | | Warm and measured. A peer who has done the job, not an announcer. |
| Speed **[O]** | | 1.0 for the 90 s master; 1.1 for the 60 s cut. |
| Your own recording **[O]** | | — |

## 6. Script

90 s master. Problem 0:00–0:18 (20%) · reveal 0:18–0:24 (6%) · features 0:24–1:16 (58%) · close 1:16–1:30 (16%).

| # | Section | Voice-over line | What we see on screen |
|---|---|---|---|
| 1 | Problem | "It's nine at night. Your last client left at seven." | Dark clinic room. Laptop glow. Chair pushed back. |
| 2 | Problem | "And you're still typing a diet chart you've typed forty times before." | A Word document; a diet table being retyped. Cursor blinking. |
| 3 | Problem | "A client's question is somewhere in your personal WhatsApp." | A personal chat list — family, a plumber, a client — scrolling past. |
| 4 | Problem | "Three people stopped following their plan last month. You found out when they left." | Three client avatars fade to grey, one by one. |
| 5 | Problem | "You trained to be a nutritionist. Not an administrator." | The laptop closes. Dark. |
| 6 | Reveal | "This is NUSI." | A full beat of silence, then the NUSI mark draws on in leaf green on near-black. |
| 7 | Feature | "Build a meal plan once. Reuse it. Copy it to the next client, and choose which weeks carry over." | `problem-diet-templates.webp` — a week built, then duplicated onto a second client. |
| 8 | Feature | "Every conversation sits on the client's record. Not in your pocket." | `problem-client-chat.webp` — a thread opening beside the client profile. |
| 9 | Feature | "NUSI tells you who has gone quiet — while there's still time to call." | `problem-at-risk.webp` — at-risk list; one row highlights, a call action. |
| 10 | Feature | "Your client photographs a plate. NUSI estimates what's on it. They correct it if they need to." | `problem-plate-vision.webp` — phone camera over a thali, macros resolving. |
| 11 | Feature | "Subscriptions, GST invoices and reminders run themselves." | An invoice generating, then marked paid. |
| 12 | Feature | "And the app your clients open carries your name. Your logo. Your colours." | A phone home screen showing the practice's own branding, not NUSI's. |
| 13 | Close | "Set up in an afternoon. Not a quarter." | The four onboarding steps ticking: brand it, bring clients in, plan once, go live. |
| 14 | Close | "NUSI. Run your practice, not your admin." | Logo, tagline, "Start free trial — 14 days, no card needed", nusi.in |

**Line 12 carries a pricing problem.** White-label is **Scale Pro only**, or a ₹2,999/mo add-on on Growth *[src: `WHITE_LABELING.md`; `backend/src/common/plan-capabilities.ts`]*. As written, the line implies every plan brands the client app. Either add an on-screen "Scale Pro, or a Growth add-on" caption, or cut the line. This is a misrepresentation risk, not a style note — see §7.

## 7. Features to show

**The "Who confirmed it" column is deliberately empty. I can confirm code exists; I cannot confirm a feature is production-ready for a paying customer. A human signs each row.**

| Feature | What the screen shows step by step | Live today? | Who confirmed it |
|---|---|---|---|
| Meal plans / templates | Build a week → reuse → copy to another client, choose weeks | Code + shipped screenshot | `[?]` |
| Client chat | Open client → thread attached to the record | Code + shipped screenshot | `[?]` |
| At-risk / gone quiet | List of clients who stopped logging → call | Code + shipped screenshot | `[?]` |
| Plate scanner (AI) | Photo of plate → estimate → client corrects | Code + shipped screenshot | `[?]` |
| Daily tasks + reminders | Meal/water reminders at set times on the client's phone | Code + shipped screenshot | `[?]` |
| Appointments | Client books inside working hours; video from Growth up | Code + shipped screenshot | `[?]` |
| GST invoices + Razorpay subscriptions | Invoice generates → paid → reminder | Code present — **see note 1** | `[?]` |
| White-label client app | Practice logo and colours on the client app | **Plan-gated — not all plans** | `[?]` |

**Three things to resolve before building. The brief's own checklist exists to catch exactly these:**

1. **Razorpay.** Project memory records that `nusi.in` was **rejected on the old Razorpay account (2026-10-14)** and needs a new account, keys, plans and webhook. If that is still open, a film showing billing running itself is selling a flow a new signup cannot complete. Confirm before including feature 7.
2. **White-label (line 12).** Scale Pro, or a paid Growth add-on. Showing it as included across the board misrepresents pricing.
3. **Blood pressure tracking.** `build-docs/CHANGELOG.md` records the BP frontend as **not yet built** (backend only). It is correctly absent from this script — keep it out.

## 8. Demo data

All invented. No real client appears anywhere.

| Field | | Your answer |
|---|---|---|
| Example customer **[R]** | | **Meera Raghavan**, 34, Chennai. Goal: reverse prediabetes, HbA1c 6.1 → under 5.7. 12-week program. Next step: follow-up on 24 Nov. |
| Example team members **[O]** | | **Dr. Anjali Menon** (owner, nutritionist) · **Priya S.** (assistant nutritionist) · **Karthik R.** (receptionist). Roles match the real role list in `backend/src/auth/permissions.ts`. |
| Numbers / figures **[O]** | | On-screen practice: 128 active clients, 86% plan adherence, ₹4,12,000 monthly revenue. **Label as illustrative** — invented. Plan pricing (₹3,999 / ₹8,999 / ₹19,999) is real and may be shown as fact. |
| Number format **[O]** | | Indian — ₹4,12,000 and ₹80 lakh, never ₹412,000. |
| Industry for the example **[O]** | | Clinical nutrition / diabetes reversal — the most credible Indian use case. |

## 9. Sound

| Field | | Your answer |
|---|---|---|
| Music mood **[O]** | | Felt piano, almost bare through the problem; low strings enter at the reveal and build through the features. Resolves rather than crescendos — this is a considered purchase. |
| Sound effects **[O]** | | Keyboard typing (line 2), a WhatsApp notification (line 3), a laptop lid closing (line 5), a camera shutter (line 10), a soft confirm on the invoice (line 11). |
| Moments of silence **[O]** | | A full beat of silence after "Not an administrator." before the mark draws on. The reveal lands in the gap. |

## 10. Final checks before building

- [ ] **Every feature in §7 confirmed live by a named person** — all 8 rows unsigned.
- [ ] **Razorpay on nusi.in confirmed working** (§7 note 1), or feature 7 cut.
- [ ] **White-label caption added, or line 12 cut** (§7 note 2).
- [ ] **Pronunciation settled** — "NOO-see" is a guess, not a fact.
- [ ] **`nusi-mark.png` verified as a transparent PNG at ≥1000 px.**
- [ ] ElevenLabs voice chosen, on a paid plan (commercial use).
- [ ] No real client names, numbers or data — §8 is fully invented. ✅ as written.
- [ ] https://nusi.in/auth?mode=signup resolves.
- [ ] Music licence covers commercial use; credit line prepared if the piano samples require one.
