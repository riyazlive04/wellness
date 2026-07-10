# SIRAH LIFE · Wellness Operating System

A **multi-tenant wellness & nutrition SaaS** for nutritionists, coaches and clinics — built by **Sirah Digital**. One platform runs many independent practices (workspaces), each with its own team, clients, branding and subscription. Three portals share one codebase: a **Super Admin** platform console, a **Workspace** (practitioner) dashboard, and a **Client** wellness app.

Architecture is **Frontend (React/Vite) → NestJS API → Supabase (Postgres)**. Every request is authenticated, tenant-scoped, role-gated, and — as of the latest work — plan-entitlement-gated.

---

## 1. Access model — three tiers

| Tier | Who | Portal |
|---|---|---|
| **Super Admin** | Sirah Digital platform operators | `/admin/*` — every workspace, revenue, health, compliance, config |
| **Workspace** | A practice: owner + staff | `/dashboard/*` — clients, programs, nutrition, AI, billing |
| **Client** | An end customer of a practice | `/me/*` — their own plan, meals, goals, chat |

Enforcement is layered and **server-side** — the frontend only mirrors it for UX:

- **JWT (Supabase auth)** resolves identity on every request ([JwtStrategy](backend/src/auth/strategies/jwt.strategy.ts)), attaching workspace, role, org membership, and effective permissions to `req.user`.
- **RolesGuard** (global) honours `@SuperAdmin()`, `@WorkspaceRole(...)`, and `@RequirePermission('resource.action')`. Super admins and org owners/admins act across their whole tenant.
- **FeaturesGuard** (global) honours `@RequireFeature(...)` — the plan-entitlement layer (§3).
- **Tenant scoping** — every query is filtered by `workspace_id`; Supabase RLS is defence-in-depth beneath the API.

### Workspace roles & permissions
Roles are data, not code — the permission matrix lives in [auth/permissions.ts](backend/src/auth/permissions.ts) and each member can have per-user grant/deny overrides.

| Role | Default scope |
|---|---|
| **owner** | Everything, including billing. |
| **manager** | Supervises the nutritionist team — **all permissions except billing**. Seat-capped per plan (§3). |
| **nutritionist** | Clients, programs, recipes, messaging, appointments, AI, analytics. |
| **assistant_nutritionist** | Read clients/programs, edit recipes, messaging, appointments, AI. |
| **receptionist** | Clients (read), appointments, messaging. |
| **coach** | Own clients, programs (read), messaging, AI, analytics. |
| **support** | Clients (read), messaging. |

Fine-grained permissions: `clients.*`, `programs.*`, `recipes.*`, `messaging.use`, `appointments.manage`, `ai.use`, `analytics.view`, `reports.view`, `automation.manage`, `billing.manage`, `team.manage`, `settings.manage`, `audit.view`.

### Organization tier (Elite)
Workspaces can be grouped under an **Organization** (multi-coach clinic / franchise) with its own roles `org_owner` / `org_admin` / `org_viewer`. Org admins act across every workspace in the org.

---

## 2. Plans — Basic · Pro · Elite

Three tiers (plus a free **Trial**). Definitions in [billing/plans.ts](backend/src/billing/plans.ts); prices in ₹/month.

| | **Basic** | **Pro** ⭐ | **Elite** |
|---|:--:|:--:|:--:|
| **Price / mo** | ₹5,000 | ₹10,000 | ₹15,000 |
| Clients | 50 | 150 | Unlimited |
| Team seats | 3 | 8 | Unlimited |
| Managers (of the seats) | 0 | 1 | 4 |
| AI calls / month | 3,000 | 12,000 | 40,000 |
| Storage | 10 GB | 50 GB | 200 GB |
| White-label | ✗ | ✗ | ✓ |

**Trial** (default for new workspaces): 10 clients / 2 team / 1 manager / 500 AI calls / 1 GB, and **Pro-level features** so evaluators can try the mid-tier.

### Quotas vs. features vs. roles — three independent gates
- **Quotas** ([LimitsService](backend/src/tenancy/limits.service.ts)) — *how many* clients / team / managers / AI calls. Exceeding one throws **HTTP 402** (`plan_limit_exceeded`) with the exact resource and cap.
- **Features** ([common/features.ts](backend/src/common/features.ts)) — *which capabilities* the tier includes at all. A missing feature throws **HTTP 402** (`feature_locked`).
- **Permissions** — *what a role* may do (§1).

### Feature entitlement map

| Feature | Basic | Pro | Elite |
|---|:--:|:--:|:--:|
| Calorie counting (client meal diary) | ✗ | ✓ | ✓ |
| Appointments | ✗ | ✓ | ✓ |
| Comprehensive assessment (anthropometry) | ✗ | ✓ | ✓ |
| Community | ✗ | ✓ | ✓ |
| Recipes | ✗ | ✗ | ✓ |
| AI Assistant (chat) | ✗ | ✗ | ✓ |
| Organizations | ✗ | ✗ | ✓ |
| *Core (clients, programs, messaging, Plate Vision, voice/vision AI quota, quick self-assessments, journal, habits, goals)* | ✓ | ✓ | ✓ |

Enforced by `@RequireFeature()` on the workspace controllers (recipes, appointments, community, assessment, AI assistant, organizations) and method-level on the client portal. The sidebar auto-hides locked modules using the plan carried on `/auth/me/scope`.

### Billing engine (Razorpay)
- **Subscriptions** with GST-compliant **invoices + PDF**, one-time **top-ups** (+AI calls, +client slots).
- **Lifecycle automation** — trial reminders, renewal, **dunning** on failed charges, a 14-day **grace** window before downgrade.
- **Proration** on upgrade/downgrade, refunds + revenue analytics.
- **Graceful degradation** — with no Razorpay keys the plan tiles still render; a **dev-only** no-payment plan switch (auto-disabled the moment real keys exist) lets you exercise entitlement gating locally.

---

## 3. Workspace (practitioner) modules

### Overview & clients
- **Overview** — practice KPIs, today's attention roll-up, activity.
- **Clients** — roster, invite (email/WhatsApp link), import, per-client detail with wellness profile, program, meals, measurements, messages, assessments, files.
- **Client wellness** — the practitioner's read-through of a client's goals / habits / journal / timeline.
- **Assessment forms** — a reusable questionnaire builder: section headers + field types (short text, number, rating scale, yes/no, multiple choice, checkboxes), a **drag-and-drop 12-column layout canvas** (set each field's width — ¼ · ⅓ · ½ · ⅔ · ¾ · full — and drag to arrange fields side-by-side, resize by dragging a field's edge), **save as draft → publish** (drafts can't be sent to clients), then assign to one or many clients. The client renders each form in its designed multi-column layout, collapsing to one column on mobile.

### Nutrition
- **Food library** — IFCT-backed food master with per-cooking-method nutrient retention ([nutrition-engine](backend/src/nutrition-engine/): 15 cooking methods, 48 retention factors); calculator normalises raw ↔ as-consumed.
- **Recipes** *(Elite)* — build/edit recipes with computed nutrition, video, share to clients.
- **Plate review** — the practitioner's queue for reviewing AI Plate-Vision meal analyses.

### Programs (Program Engine)
- Reusable **program templates → tasks → assign** to clients with **snapshot/versioning** (editing a template never mutates a live assignment), daily completion tracking, **compliance & analytics**, and AI-suggested recommendations.

### Appointments *(Pro/Elite)*
- Real DB-backed scheduling both portals; consultation / follow-up / check-in / assessment / group session; video / phone / in-person. **Embedded Jitsi video** meeting room with join config.

### Communication
- **Messaging** — practitioner ↔ client threads: reactions, edit, pin, read receipts, bulk send, templates.
- **Collaborate (Team chat)** *(Module 9)* — internal channels, shared notes, plus **AI conversation-summary & smart-replies** on client threads.
- **Community** *(Pro/Elite)* — workspace social feed: groups, posts, reactions, comments, moderation, challenge leaderboards.
- **Announcements** — workspace-wide broadcasts.

### AI
- **AI Assistant** *(Elite)* — a role-resolved assistant (executive / clinical / wellness) with Gemini function-calling tools, persistent memory, a morning brief, and an action engine ([ai-assistant](backend/src/ai-assistant/)).
- **AI Ecosystem** *(Module 12)* — enterprise AI governance: a recommendation store, a **human-approval queue** for AI-proposed actions (e.g. broadcasts), an AI-feedback learning signal, and unified AI analytics.
- **Voice AI** — voice meal/attribute logging (Gemini multimodal, identification-only).

### Insight & ops
- **Analytics** *(Module 10)* — workspace BI over existing data: KPIs, growth, engagement, nutrition, program compliance, AI usage; Recharts dashboard + AI insights + PDF export.
- **Automation** *(Module 11)* — rules engine with real actions (message client / push / AI note), scheduled daily/weekly triggers, run log + analytics.
- **Reports** — templated report generation + PDF.
- **Activity** — workspace activity log.

### Account & governance
- **Billing / Subscription** — plan tiles, usage meters, invoices, top-ups (§2).
- **Team** — invite staff (incl. **Manager**), assign roles, per-member permission overrides; seat + manager caps enforced.
- **Organizations** *(Elite)* — group workspaces, org members, org-level activity.
- **Verification** — submit practitioner KYC (credentials + documents) for super-admin approval.
- **Settings** — branding (white-label on Elite), data, security, notifications; **Privacy policy** gate.

---

## 4. Client portal

The end-customer wellness app (`/me/*`), mobile-first / PWA.

- **Home** — wellness score, today's stats, banner quotes, quick actions (pull-to-refresh, FAB).
- **Meals** *(calorie counting — Pro/Elite)* — meal diary; log by **Plate Vision photo** or **barcode scan**. Scanning auto-detects in any browser (native `BarcodeDetector` with a ZXing fallback for Firefox/Brave/Safari) and resolves against **Open Food Facts + a curated, self-healing cache** → meal log with product image and per-serving calories.
- **Plate Vision** — snap a plate via **live camera (desktop + mobile) or photo upload** → AI identifies foods + nutrition; the meal (with its photo thumbnail) is sent to the practitioner's review queue.
- **Recipes / Foods** *(Recipes = Elite)* — recipe library + detail; food search.
- **Programs** — assigned program + daily tasks with completion.
- **Wellness OS** *(Module 7)* — **Goals**, **Habits** (with streaks), **Journal** (with AI reflection), unified **Timeline**.
- **Measurements** *(comprehensive assessment — Pro/Elite)* — body measurement history → BMI/BMR/TDEE/body-fat.
- **Assessments** — quick self-report questionnaires (sleep / energy / stress) plus **practitioner-authored custom forms** assigned from the workspace, rendered in their designed multi-column layout — **always available on every plan**.
- **Appointments** *(Pro/Elite)* — view/book/cancel, join embedded video.
- **Community** *(Pro/Elite)* — groups, feed, posts, comments, leaderboards.
- **Chat** — thread with the assigned practitioner.
- **Progress / Reports** — trends and shared reports.
- **Wellbeing · Cycle · Supplements · Photos · Files** — supporting wellness surfaces.
- **Assistant** — a floating AI **chat** companion on the client portal. *(The client-side voice assistant / voice meal-logging has been retired; voice AI remains in the practitioner console.)*
- **Notifications** — in-app + web push; **Settings**; guided **Onboarding** wizard.

---

## 5. Super Admin (platform console)

`/admin/*` — Sirah Digital's operator view across all tenants.

- **Overview** — platform KPIs.
- **Workspaces** — every workspace + drill-down detail; **Subscriptions**, **Revenue**, **Billing** — MRR, plans, invoices across tenants.
- **Users** / **Team** — platform directory.
- **AI Usage** — AI consumption across workspaces; **Executive AI** console.
- **Health** — system health; **Compliance** & **Privacy policy**; **Audit** log.
- **Config** — platform configuration (plans, flags, quotas).
- **Integrations** — external service config.
- **Verifications** — approve/reject practitioner KYC submissions.
- **Announcements** — platform-wide, role-targeted.
- **Impersonation** — a super admin can pin and act inside any workspace for support.

---

## 6. Cross-cutting

- **Multi-tenancy** — `workspace_id` on every tenant row; workspace switching + impersonation; RLS beneath the API.
- **Feature entitlement** — the plan→feature layer (§2), mirrored to the frontend for nav/lock UX.
- **Mobile / PWA** — device-tier hooks, native primitives (bottom-sheet, FAB, pull-to-refresh, page transitions), owner mobile bottom nav, safe-area CSS, installable PWA.
- **Notifications** — in-app feed + **web push** (VAPID); billing event feed.
- **Realtime** — WebSocket gateway (`/api/realtime`) for live chat/presence.
- **Search** — global command palette.
- **White-label** *(Elite)* — remove SIRAH branding from client portal + invoices.
- **Audit & compliance** — sensitive actions logged; data-privacy / policy modules.

---

## 7. Data & tech

- **Backend** — NestJS (versioned REST under `/api/v1`), Prisma + raw SQL, global guards (throttle → JWT → roles → features).
- **Database** — Supabase Postgres. Enums for roles/plans; migrations in [supabase/migrations](supabase/migrations/). Key domains: `workspaces`, `workspace_members` / `workspace_invites`, `subscriptions` / invoices, `clients` / `client_invites`, `programs`, `meal_logs`, `barcode_products`, `assessment_form_templates` (draft/published), `ai_usage_events`, `organizations`, plus per-feature tables.
- **Auth** — Supabase JWT, per-request identity resolution with a short auth cache.
- **AI** — Google **Gemini 2.5 Flash** (vision + voice + assistant), function-calling tools, governance queue.
- **Payments** — **Razorpay** subscriptions + orders + webhooks; GST invoicing.
- **Frontend** — React 18 + Vite + TypeScript, Tailwind + shadcn/ui, TanStack Query, Framer Motion, dnd-kit (drag-and-drop), a bespoke design-system with an app-wide **bold typographic scale**; Recharts for analytics.
- **Deployment** — backend on Render off `main`; `node dist/main.js`.

---

## 8. Notable design decisions

- **Three independent gates** — quotas, features, and roles are orthogonal; a Pro nutritionist has `recipes.*` by role yet is still blocked because Recipes isn't in Pro's feature set.
- **Server-enforced everything** — the frontend hides/locks for UX, but every rule is re-checked in the API (402/403), never trusted from the client.
- **Fail-safe billing** — unknown/lapsed plans fall back to trial limits, never accidental "unlimited"; the dev plan-switch self-disables once real keys exist.
- **Snapshot on assign** — editing a program template never rewrites a client's live plan.
- **Human-in-the-loop AI** — enterprise AI proposes; a person approves before anything client-facing executes.

---

*SIRAH LIFE · a Sirah Digital product · [sirahdigital.in](https://sirahdigital.in/)*
