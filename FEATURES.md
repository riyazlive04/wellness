# SIRAH LIFE · The Wellness Operating System for nutrition practices

**SIRAH LIFE** is an all-in-one, multi-tenant SaaS that runs a nutrition practice end to end — and gives that practice's clients a beautiful wellness app to stay on plan. Built by **Sirah Digital**.

One platform runs many independent practices (**workspaces**), each with its own team, clients, branding and subscription. Three portals share one codebase: a **Super Admin** platform console, a **Workspace** (practitioner) dashboard, and a **Client** wellness app — the client app ships on **web (PWA)** *and* as a **native mobile app** (Android/iOS via Expo).

Architecture: **React/Vite frontend → NestJS API → Supabase (Postgres)**. Every request is authenticated, tenant-scoped, role-gated, and plan-entitlement-gated — all **server-side**.

---

## How it plays in the market

**The problem.** A nutritionist today stitches together 5–6 tools: a scheduler, WhatsApp, a spreadsheet for meal plans, a separate app for the client, Razorpay links for payments, and a notebook for compliance. Nothing talks to each other, clients disengage, and the practitioner spends more time on admin than on care.

**The pitch.** SIRAH LIFE replaces that whole stack with **one system** — CRM + programs + nutrition science + scheduling + messaging + billing + analytics + a client app — so a solo nutritionist or a multi-branch clinic runs everything in one place.

**Why it wins (positioning & moats):**
- **India-native by design** — IFCT-2017 food database with cooking-retention science, **GST-compliant invoicing**, **Razorpay** subscriptions, **WhatsApp** notifications, and ₹ pricing. Global tools (Practice Better, Healthie, Nutrium) aren't built for this.
- **Two-sided value** — the practitioner grows revenue; the client gets an **engaging app** (Plate Vision, streaks, journal, mood) → better adherence → **retention** → the practitioner renews. Engagement is the retention engine.
- **AI woven through, not bolted on** — snap-a-plate meal logging, a role-aware AI assistant, AI insights, and AI-drafted client nudges — all metered by transparent **AI credits**.
- **Scales from solo to franchise** — the same product serves a ₹3,999/mo solo coach and a ₹19,999/mo multi-branch clinic with white-label, multi-branch rollups, staff roles, and a developer API.
- **Land-and-expand pricing** — a free trial → Starter → Growth → Scale Pro, plus one-time AI-credit top-ups and add-ons, so revenue grows with the practice.

**Target customers:** solo nutritionists & dietitians, online coaches, wellness studios, and multi-branch nutrition clinics / franchises — primarily India, expandable.

---

## 1. Access model — three tiers

| Tier | Who | Portal |
|---|---|---|
| **Super Admin** | Sirah Digital platform operators | `/admin/*` — every workspace, revenue, health, compliance, config |
| **Workspace** | A practice: owner + staff | `/dashboard/*` — clients, programs, nutrition, AI, billing |
| **Client** | An end customer of a practice | Web `/me/*` + **native mobile app** — their own plan, meals, goals, chat |

Enforcement is layered and **server-side**; the frontend only mirrors it for UX:
- **JWT (Supabase auth)** resolves identity per request and attaches workspace, role, org membership and effective permissions to `req.user`.
- **RolesGuard** (global) honours `@SuperAdmin()`, `@WorkspaceRole(...)`, `@RequirePermission('resource.action')`.
- **FeaturesGuard** (global) honours `@RequireFeature(...)` — the plan-entitlement layer (§2).
- **Tenant scoping** — every query is filtered by `workspace_id`; Supabase RLS sits beneath as defence-in-depth.

### Workspace roles & permissions
Roles are data, not code — the permission matrix lives in `backend/src/auth/permissions.ts`, and each member can carry per-user grant/deny overrides.

| Role | Default scope |
|---|---|
| **owner** | Everything, including billing. |
| **manager** | Supervises the team — **all permissions except billing**. Seat-capped per plan. |
| **nutritionist** | Clients, programs, recipes, messaging, appointments, AI, analytics. |
| **assistant_nutritionist** | Read clients/programs, edit recipes, messaging, appointments, AI. |
| **receptionist** | Clients (read), appointments, messaging. |
| **coach** | Own clients, programs (read), messaging, AI, analytics. |
| **support** | Clients (read), messaging. |

### Organization tier (multi-branch / franchise)
Workspaces can be grouped under an **Organization** with its own roles `org_owner` / `org_admin` / `org_viewer`. Org admins act across every workspace, and a **Franchise dashboard** rolls up clients, revenue (MRR) and growth across all locations (§3).

---

## 2. Plans & pricing — Starter · Growth · Scale Pro (2026)

Three sellable tiers plus a free **14-day Trial**. Definitions in `backend/src/billing/plans.ts`.

| | **Starter** | **Growth** ⭐ *most popular* | **Scale Pro** |
|---|:--:|:--:|:--:|
| **Monthly** | ₹3,999 | ₹8,999 | ₹19,999 |
| **Annual** (2 months free) | ₹39,999 | ₹89,999 | ₹1,99,999 |
| One-time setup fee | ₹4,999 | ₹9,999 | ₹24,999 |
| Positioning | Solo nutritionists | Growing practices | Clinics & multi-coach centers |
| Clients | 100 | 500 | Unlimited |
| Team members | 1 | 5 | Unlimited |
| Manager seats | 0 | 1 | Unlimited |
| **AI credits / month** | 500 | 5,000 | 25,000 |
| Storage | 5 GB | 50 GB | 200 GB |
| "Total value" anchor | ₹40,000+ | ₹90,000+ | ₹2,50,000+ |

- **1 AI credit = 1 AI call** (Plate Vision scan, assistant message, insight, voice log…). Credits refresh monthly; run out and you **top up** (₹999 / 1k · ₹3,999 / 5k · ₹9,999 / 20k) or upgrade.
- **Add-ons:** +100 client slots (₹999), plus recurring add-ons on the roadmap (extra seat, WhatsApp API, white-label for Growth).
- **Trial** (default for new workspaces): 10 clients / 2 team / 500 AI credits / 1 GB, with the **Growth feature set** so evaluators experience the "most popular" tier before paying.

### Three independent gates — quota vs. feature vs. role
- **Quotas** (`LimitsService`) — *how many* clients / team / managers / AI calls / **storage bytes**. Exceeding one → **HTTP 402 `plan_limit_exceeded`** with the exact resource and cap. (Storage is now **enforced on upload**, with a live usage bar on Billing.)
- **Features** (`common/features.ts`) — *which capabilities* the tier includes at all → **HTTP 402 `feature_locked`**.
- **Permissions** — *what a role* may do (§1).

### Feature entitlement map

| Feature | Starter | Growth | Scale Pro |
|---|:--:|:--:|:--:|
| Calorie counting · Plate Scanner · Barcode · Food diary | ✓ | ✓ | ✓ |
| Client mobile app · Habit/Goal tracking · Progress · Reports | ✓ | ✓ | ✓ |
| Online appointment booking · Video consultation | ✗ | ✓ | ✓ |
| Comprehensive assessment (anthropometry) | ✗ | ✓ | ✓ |
| Community groups | ✗ | ✓ | ✓ |
| AI Nutrition Assistant | ✗ | ✓ | ✓ |
| Automation (rules engine) | ✗ | ✓ | ✓ |
| Analytics dashboard | ✗ | ✓ | ✓ |
| Recipe library | ✗ | ✗ | ✓ |
| Multi-branch / Organizations + **Franchise dashboard** | ✗ | ✗ | ✓ |
| **Revenue analytics** | ✗ | ✗ | ✓ |
| **Audit / Activity log** | ✗ | ✗ | ✓ |
| **API access** (developer keys) | ✗ | ✗ | ✓ |
| **White-label** (remove SIRAH branding) | ✗ | ✗ | ✓ |

Enforced by `@RequireFeature()` on the relevant controllers; the sidebar auto-hides locked modules using the plan carried on `/auth/me/scope`. Retired legacy plans (basic/pro/elite) are **grandfathered** so existing subscribers keep what they bought.

### Billing engine (Razorpay)
- **Subscriptions** (monthly + annual) with GST-compliant **invoices + PDF**, one-time **top-ups** and a one-time **setup fee** at signup.
- **Lifecycle automation** — trial reminders, renewal, **dunning** on failed charges, a 14-day **grace** window before downgrade.
- **Proration** on upgrade/downgrade, refunds + revenue analytics.
- **Graceful degradation** — with no Razorpay keys the plan tiles still render; a **dev-only** no-payment plan switch (auto-disabled once real keys exist) exercises entitlement gating locally. A "soft" (non-subscription) plan can be marked **Current — pay to activate** on the pricing cards.

---

## 3. Workspace (practitioner) modules

*The dashboard has been redesigned in an **ocean-teal "wellness" visual language** — warm rounded cards, soft tints, gradient accents — across every section.*

### Overview & clients
- **Overview** — practice KPIs, a "clients need attention" roll-up, compliance donut, practice-pulse, at-risk list, AI suggested actions.
- **Clients** — roster, invite (email / WhatsApp link), import, per-client detail (wellness profile, program, meals, measurements, messages, assessments, files).
- **Assessment forms** — a reusable questionnaire builder: field types (short text, number, rating, yes/no, choice, checkboxes) on a **drag-and-drop 12-column layout canvas** (per-field widths ¼→full, side-by-side, resize by dragging), **draft → publish**, then assign to one or many clients (rendered in the designed multi-column layout, collapsing to one column on mobile).

### Nutrition
- **Food library** — IFCT-2017 food master with per-cooking-method nutrient retention (15 methods, 48 retention factors); calculator normalises raw ↔ as-consumed. *Market angle: real Indian food science, not a US calorie table.*
- **Recipes** *(Scale Pro)* — build/edit recipes with computed nutrition + video, publish/share to clients, bulk-publish.
- **Plate review** — the practitioner's queue for reviewing AI Plate-Vision meal analyses.
- **Products / Shop** — sell products/supplements to clients (Razorpay checkout).

### Programs (Program Engine)
Reusable **program templates → tasks → assign** to clients with **snapshot/versioning** (editing a template never mutates a live assignment), daily completion tracking, **compliance & analytics**, and AI-suggested recommendations. *Market angle: productise your methodology once, deliver it to 100 clients.*

### Appointments *(Growth / Scale Pro)*
DB-backed scheduling in both portals; consultation / follow-up / check-in / assessment / group; video / phone / in-person, with an **embedded Jitsi video room**.

### Communication
- **Messaging** — practitioner ↔ client threads: reactions, edit, pin, read receipts, bulk send, templates, attachments.
- **Team chat (Collaborate)** — internal channels + shared notes, plus **AI conversation-summary & smart-replies** on client threads.
- **Community** *(Growth / Scale Pro)* — workspace social feed: groups, posts, reactions, comments, moderation, challenge leaderboards. *Market angle: turn a client base into a retained community.*
- **Announcements** — workspace-wide broadcasts.

### AI
- **AI Assistant** *(Growth / Scale Pro)* — a role-resolved assistant (executive / clinical / wellness) with Gemini function-calling tools, persistent memory, a morning brief, and an action engine.
- **Plate Vision** — snap a plate → AI identifies foods + nutrition → the practitioner's review queue.
- **Voice AI** — voice meal/attribute logging (Gemini multimodal, practitioner console).
- Every AI call draws down the workspace's monthly **AI credits** (transparent, top-uppable).

### Insight & ops
- **Analytics** *(Growth / Scale Pro)* — workspace BI: KPIs, growth, engagement, nutrition, program compliance, AI usage; Recharts dashboard + AI insights + PDF export. **Revenue analytics** (MRR breakdown + trend) is **Scale Pro**.
- **Automation** *(Growth / Scale Pro)* — a rules engine with real actions (message client / push / AI note) + scheduled daily/weekly triggers + run log.
- **Reports** — templated report generation + PDF.
- **Activity / Audit log** *(Scale Pro)* — a full write-audit of every action in the workspace.

### Account & governance
- **Billing / Subscription** — plan tiles (with **current-plan** marker), usage meters (clients · AI calls · team · **storage**), invoices, top-ups, setup fee (§2).
- **Team** — invite staff (incl. **Manager**), assign roles, per-member permission overrides; seat + manager caps enforced.
- **Organizations & Franchise dashboard** *(Scale Pro)* — group workspaces into a chain; the **Franchise dashboard** rolls up active clients, new-this-month, team size and **active-subscription MRR per location** plus org-wide totals. *Market angle: run a franchise from one screen.*
- **Verification** — submit practitioner KYC (credentials + documents) for super-admin approval.
- **Settings** — branding (**white-label** on Scale Pro), integrations, security, data, notifications, **Public page**, privacy-policy gate, and **API keys** (§7).

---

## 4. Client app — web + native mobile

The end-customer wellness experience, on the **web (PWA)** and a **native mobile app** (Android/iOS, built with Expo). The mobile app ships JS/design updates **silently over-the-air (OTA)** — no reinstall — and has been redesigned in the same **ocean-teal wellness** language.

**Bottom-tab experience:** Today · Meals · Progress · Chat · Assistant · More.

- **Today** — greeting, "today's focus" hero, habit rings (water / sleep / move), mood check-in, meal plan.
- **Meals** *(calorie counting)* — meal diary; log by **Plate Vision photo** or **barcode scan** (native `BarcodeDetector` with a ZXing fallback; resolves against **Open Food Facts + a curated cache**), calorie ring + intake.
- **Plate Vision** — snap a plate (live camera or upload) → AI identifies foods + nutrition → sent to the practitioner's review queue.
- **Progress** — weight trend + sparkline, adherence, streaks, achievements.
- **Wellness OS** — **Goals**, **Habits** (streaks), **Journal** (with AI reflection), unified **Timeline**.
- **Programs** — assigned program + daily tasks.
- **Measurements** *(comprehensive assessment)* — body measurement history → BMI / BMR / TDEE / body-fat.
- **Assessments** — quick self-report questionnaires **plus practitioner-authored custom forms** — always available on every plan.
- **Appointments** *(Growth / Scale Pro)* — view/book/cancel, join embedded video.
- **Community** *(Growth / Scale Pro)* — groups, feed, comments, leaderboards.
- **Chat** — thread with the assigned practitioner. **Assistant** — an AI chat companion.
- **Recipes / Foods · Shop / Supplements · Cycle · Photos · Files · Reports** — supporting surfaces.
- **Notifications** — in-app + web/native push; guided **Onboarding**.

*Market angle: the client app is the practitioner's retention weapon — the more a client logs, streaks, and chats, the less they churn.*

---

## 5. Super Admin (platform console)

`/admin/*` — Sirah Digital's operator view across all tenants: **Overview** (platform KPIs) · **Workspaces** (+ drill-down) · **Subscriptions / Revenue / Billing** (MRR, plans, invoices across tenants) · **Users / Team** · **AI Usage** + Executive AI · **Health / Compliance / Audit** · **Config** (plans, flags, quotas) · **Integrations** · **Verifications** (approve/reject KYC) · **Announcements** (role-targeted) · **Impersonation** (act inside any workspace for support).

---

## 6. Cross-cutting

- **Multi-tenancy** — `workspace_id` on every tenant row; workspace switching + impersonation; RLS beneath the API.
- **Feature entitlement** — the plan→feature layer (§2), mirrored to the frontend for nav/lock UX.
- **Mobile / PWA / native** — device-tier hooks, native primitives (bottom-sheet, FAB, pull-to-refresh), installable PWA, **plus a native app with self-hosted OTA updates**.
- **Notifications** — unified in-app feed + **web push** (VAPID) + native push across client/staff/admin.
- **Realtime** — WebSocket gateway (`/api/realtime`) for live chat/presence.
- **White-label** *(Scale Pro)* — remove SIRAH branding from client portal + invoices.
- **Audit & compliance** — sensitive actions logged; data-privacy / policy modules.

---

## 7. Developer API *(Scale Pro)*

A **public REST API** authenticated by **workspace API keys** — the "API access" tier feature.

- **Manage keys:** Settings → Integrations → API keys — create (the full key is shown **once**), copy, revoke. Only a **SHA-256 hash** + a display prefix are stored; the plaintext is never persisted.
- **Authenticate:** send `X-API-Key: sk_live_…` (or `Authorization: Bearer …`) to `GET /api/v1/public/*` (`ping`, `clients`, `clients/:id`). Every response is **scoped to the key's workspace**.
- **Plan-aware:** the guard re-checks the plan on each call, so a downgrade below Scale Pro **disables existing keys**. Rate-limited by the global throttler.

*Market angle: let clinics wire SIRAH into their own dashboards, Zapier, or BI — the integration surface that upsells them to the top tier.*

---

## 8. Data & tech

- **Backend** — NestJS (versioned REST under `/api/v1`), Prisma + raw SQL, global guards (throttle → JWT → roles → features).
- **Database** — Supabase Postgres; migrations in `supabase/migrations/`. Key domains: `workspaces`, `workspace_members`/`invites`, `subscriptions`/invoices, `clients`, `programs`, `meal_logs`, `files`, `workspace_api_keys`, `assessment_form_templates`, `ai_usage_events`, `organizations`, plus per-feature tables.
- **AI** — Google **Gemini 2.5 Flash** (vision + voice + assistant), function-calling tools.
- **Payments** — **Razorpay** subscriptions + orders + webhooks; GST invoicing.
- **Storage** — Supabase Storage (`client-files` bucket); usage summed + **enforced** against the plan cap.
- **Frontend (web)** — React + Vite + TypeScript, Tailwind + shadcn/ui, TanStack Query, Framer Motion, dnd-kit, Recharts; ocean-teal wellness design system.
- **Mobile** — React Native / **Expo** (expo-router), self-hosted **OTA** update server (silent JS/asset updates; `runtimeVersion` gates compatibility).
- **Deployment** — backend on **Render** (off `main`) + a self-hosted **VPS** (`nusi.sirahagents.com`, nginx + pm2); mobile ships via OTA.

---

## 9. Notable design decisions

- **Three independent gates** — quotas, features, and roles are orthogonal; a role can allow an action the plan still blocks (402).
- **Server-enforced everything** — the frontend hides/locks for UX, but every rule is re-checked in the API (402/403), never trusted from the client.
- **Fail-safe billing** — unknown/lapsed plans fall back to trial limits, never accidental "unlimited"; legacy tiers are grandfathered.
- **Snapshot on assign** — editing a program template never rewrites a client's live plan.
- **Honest UX** — features are only advertised where they're actually enforced/built; no fabricated "estimated" data or attributed messages that a person didn't write.

---

*SIRAH LIFE · a Sirah Digital product · [sirahdigital.in](https://sirahdigital.in/)*
