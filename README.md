# SIRAH LIFE — Mobile App

Native iOS + Android app for **both sides of SIRAH LIFE**, built with Expo
(SDK 57) + expo-router. It talks to the **same** production backend as the web
app: Supabase for auth/data and the NestJS API for everything else, so one login
works across web and mobile.

This is a **from-scratch React Native rewrite**, not a webview wrapper.

**One app, two shells.** After sign-in the server-resolved tier
(`/auth/me/scope`) picks the experience:

| Tier                       | Shell                | Tabs                                          |
| -------------------------- | -------------------- | --------------------------------------------- |
| `client`                   | Client portal        | Today · Meals · Assistant · Progress · Chat · More |
| `workspace`/`super_admin`  | Nutritionist portal  | Overview · Clients · Inbox · Schedule · More   |
| `unaffiliated`             | `/practice-setup`    | (points at the web onboarding wizard)          |

---

## Prerequisites

- Node **20.19.4+** recommended (18.x/20.18 works for Expo Go but throws engine
  warnings; EAS cloud builds use a correct Node).
- The **Expo Go** app on your phone (iOS App Store / Google Play) for the fastest
  dev loop, OR Android Studio / Xcode for native dev builds.

## Configure

Environment lives in `.env` (git-ignored). The keys mirror the web app:

```
EXPO_PUBLIC_SUPABASE_URL=...        # same Supabase project as web
EXPO_PUBLIC_SUPABASE_ANON_KEY=...   # public anon key (RLS-restricted)
EXPO_PUBLIC_API_BASE_URL=...        # NestJS API base — CONFIRM before shipping
```

> ⚠️ **Confirm `EXPO_PUBLIC_API_BASE_URL`** points at your live API
> (`https://api.sirahdigital.in` is the documented prod host; the Render URL is
> the other candidate). For local backend dev use your PC's LAN IP
> (`http://192.168.x.x:3001`), **never** `localhost` — the phone can't reach it.

After changing `.env`, restart with a cache clear: `npx expo start -c`.

## Run (dev)

```bash
npm install
npx expo start        # scan the QR with Expo Go (Android) / Camera (iOS)
```

## Build real apps (EAS — no Mac needed for iOS)

`eas.json` defines three profiles. iOS compiles in Expo's cloud, so you can ship
to the App Store from Windows.

```bash
npm i -g eas-cli
eas login
eas build:configure

# Installable Android APK for testers:
eas build -p android --profile preview

# Store builds (Play Store .aab + App Store .ipa):
eas build -p android --profile production
eas build -p ios     --profile production

# Submit to the stores:
eas submit -p android --profile production
eas submit -p ios     --profile production
```

Bundle IDs are set in `app.json`: `in.sirahdigital.life` (both platforms).

---

## Architecture

```
src/
  app/                       # expo-router (file-based routes)
    _layout.tsx              # providers + auth gate + TIER ROUTING
    index.tsx                # splash → redirect
    practice-setup.tsx       # unaffiliated practitioners
    (auth)/login.tsx         # Supabase email/password sign-in
    (tabs)/                  # CLIENT shell (5 tabs + More)
      index / meals / assistant / progress / chat / more
    (owner)/                 # NUTRITIONIST shell (4 tabs + More)
      index.tsx              # Overview
      clients/               # roster · [id] detail · requests (intake queue)
      messaging/             # inbox · [clientId] thread
      appointments/          # schedule · [id] · meeting/[id] (video)
      more/                  # everything else in the nav map
        programs/ assessments/ nutrition/ ai · voice · analytics
        community · collaborate · team · billing · organizations
        reports · notifications · activity · settings
  components/
    ui/index.tsx             # Screen, Card, AppText, GradientButton, ...
    owner/ui.tsx             # OwnerPage, StatTile, ListRow, Sheet, RouteGate…
    owner/charts.tsx         # SVG bar / breakdown / donut (no chart dependency)
    owner/nutrition/         # Foods · Recipes · Plate review · Products
    meeting-room.tsx         # embedded Jitsi/Daily room, shared by both portals
    score-ring.tsx / trend-chart.tsx / razorpay-checkout.tsx
  contexts/
    auth-context.tsx         # Supabase session + role
    owner-context.tsx        # scope, isOwner, can(), hasFeature(), nav, badges
  hooks/
    use-scope.ts             # /auth/me/scope — tier, plan, features, permissions
    use-editable.ts          # form edits layered over server state (no hydration effect)
    use-theme.ts             # light/dark theme resolver (dark-first)
  lib/
    supabase.ts / api.ts / theme.ts / query-client.ts
    clients-api.ts           # /me/* (client portal)
    plan-capabilities.ts     # feature entitlements (mirrors the web)
    owner/
      nav.ts                 # owner nav map + plan/permission filtering
      format.ts              # dates, currency, initials (no date-fns)
      api/*.ts               # the workspace API surface, ported from the web
```

### Nutritionist gating

The owner nav is filtered by the **same two rules the web sidebar applies**, both
sourced from `/auth/me/scope`:

- **Plan features** — `feature: 'analytics'` etc. hides a destination the
  workspace's plan doesn't include (never a 402 dead end).
- **Fine-grained permissions** — `permission: 'clients.read'` etc. hides what a
  staff member isn't granted; owners and super admins hold everything.

`RouteGate` applies the same pair at the page level, and the backend
(`RolesGuard` + `FeaturesGuard`) enforces it independently — the UI gating is
purely so nobody is offered a door that won't open.

Auth + data reuse the web contracts verbatim, so ported screens behave
identically. Theming is ported from the web design tokens (blue → teal → cyan,
dark-first).

## Porting status

### Nutritionist portal — full parity with the web owner nav

All 20 web sidebar destinations are ported, gated by the same plan features and
permissions.

- ✅ **Overview** — KPIs, AI insight, at-risk + plate-review attention queue,
  recent clients, assessments, programs, MRR, subscription
- ✅ **Clients** — searchable/filtered roster with at-risk badges, join link
  (share/copy/rotate), bulk email invite, intake queue (join requests +
  pre-approvals)
- ✅ **Client detail** — Overview · Nutrition · Wellness · Assessments · Notes ·
  Files, coach assignment, assign/review assessments, file vault
- ✅ **Messaging** — inbox with unread counts; thread with reply, react, edit,
  delete, pin, quick replies, AI summary + smart replies
- ✅ **Appointments** — requests to approve/decline, upcoming grouped by day,
  book, reschedule, status, embedded video room
- ✅ **Programs** — template library, task builder, publish, assign, push edits
  to running assignments, cohort group chat
- ✅ **Assessments** — form library, starter forms, and the full builder (all 8
  question types; ordered list instead of the web's drag-and-drop grid)
- ✅ **Nutrition** — Food library (+ custom foods) · Recipes (ingredients,
  computed nutrition, bulk import/publish) · Plate review · Products + orders
- ✅ **AI Assistant** — brief, conversations, chat with confirm-before-run
  actions, memory
- ⬜ **Voice** (hold-to-talk → `/voice/converse`) — written, but held back: it
  needs `expo-audio`, which can't ride an OTA. Stub screen ships in its place
- ✅ **Analytics** — growth, engagement, nutrition, programs, AI usage, ops,
  revenue, at-risk (SVG charts, no charting dependency)
- ✅ **Community** — moderation counts, cohort feed, post, react, comment, pin
- ✅ **Team** — members, invites (or direct login), seat limits, workspace
  switching, and the tri-state permission editor
- ✅ **Billing** — plan picker with proration preview, Razorpay subscription +
  AI-credit top-ups, invoices, cancel
- ✅ **Organizations** — franchise roll-up, locations, members, activity
- ✅ **Reports** — templates, target picker, real report data, history
- ✅ **Notifications** — staff feed + channel/per-event/quiet-hours preferences
- ✅ **Activity** — searchable audit trail with full request payloads
- ✅ **Settings** — General · Branding · Public page · Verification ·
  Integrations · Security (API keys, server URL) · Data (retention, exports)
- ⬜ PDF generation on-device (reports/invoices open from the web instead)
- ⬜ Push notifications for staff events

### Client portal

- ✅ **Foundation** — auth, session persistence, API layer, theme, navigation
- ✅ **Login**
- ✅ **Today** (Home) — score ring, habit quick-log (water/mood), nutrition,
  nutritionist nudge, active program, quick actions, pull-to-refresh
- ✅ **Meals** — today's totals vs target, history grouped by day (1/7/30d),
  program hint (camera log tiles flagged "coming soon")
- ✅ **Chat** — message bubbles, send, mark-read, 5s polling for near-realtime
- ✅ **Progress** — weight trend chart, BMI, habit tiles + weight/sleep logging,
  14-day consistency strip
- ✅ **Assistant** — AI wellness chat: greeting + capabilities, suggested
  prompts, send → reply with optimistic bubbles
- ✅ **Plate Vision** (camera) — take/pick a meal photo → AI analyze
  (`/vision/analyze`) → review detected items & portions, pick meal type →
  log (`/me/plates`). Modal route `/plate-vision`, launched from Today + Meals.
- ✅ **Habits** — list, tap-to-toggle with streak + last-7 dots, add habit
  (More → Habits)
- ✅ **Journal** — entries with mood, new-entry sheet, on-demand AI reflection
  (More → Journal)
- ✅ **Goals** — active/achieved with progress bars, mark achieved, create
  (More → Goals)
- ✅ **Settings** — profile display, practice, appearance, version, sign-out
  (More → Settings)
- ⬜ Barcode scan (packaged food) — `expo-camera` barcode scanner
- ⬜ Meal plan / Measurements / Photos / Timeline
- ⬜ Realtime chat (upgrade polling → socket.io)
- ⬜ Wellbeing / Cycle / Programs / Assessments
- ⬜ Recipes / Supplements / Reports / Files
- ⬜ Appointments (+ video) / Community / Notifications
- ⬜ Push notifications (`expo-notifications`)

Port order and per-screen source live in `PORTING.md`.

### Shipping: two channels

| Change | Channel | Command |
| --- | --- | --- |
| JS / assets only | **OTA** — silent, no reinstall | `bash ota-server/publish-ota.sh "notes"` |
| Native module, permission, SDK bump, or a wedged install | **APK** — user installs | `cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`<br>then `bash ota-server/release-apk.sh "notes"` |

Two traps worth knowing:

- **A wedged app can't be rescued by OTA.** The update check is gated on a
  signed-in session ([`_layout.tsx`](src/app/_layout.tsx)) with
  `checkAutomatically: "NEVER"`, so an install stuck before sign-in never asks
  the server for anything. Only a reinstall recovers it — that's what the APK
  channel is for.
- **Always build `-PreactNativeArchitectures=arm64-v8a`.** Without it Gradle
  builds all four ABIs and the APK goes 47 MB → 130 MB. Users have been on
  mobile data as slow as 12 KB/s.

Verify the signature before publishing, or the upgrade silently fails to
install over the existing app:

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"   # or apksigner reports nothing
"$ANDROID_HOME/build-tools/36.1.0-rc1/apksigner.bat" verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
# expect: CN=SIRAH LIFE ... SHA-256 digest: 3b9548d6...b5b76f
```

### Why the owner portal has no native dependencies

It ships **over the air** to already-installed apps, so it must add nothing
native. Two modules were tried and removed for exactly that reason:

| Wanted | Why it can't ride an OTA | What ships instead |
| --- | --- | --- |
| `expo-clipboard` (copy buttons) | `requireNativeModule('ExpoClipboard')` runs at **import** | `Share.share` + `selectable` text |
| `expo-audio` (Voice recording) | `requireNativeModule('ExpoAudio')` runs at **import** | `more/voice.tsx` stub explaining the wait |

The danger is worse than "the feature won't work". expo-router eagerly
evaluates every route file to build its tree, so a native import inside an
owner route runs at **launch** — for clients too. Shipping one over the air to
a binary that lacks it crashes the app on start for every installed user.

Before publishing an OTA, check the dependency surface hasn't moved:

```bash
git diff HEAD -- package.json | grep -E '^[-+].*(expo-|react-native-)'
# no output  →  safe to publish
```

Restoring Voice is documented in the header of `src/app/(owner)/more/voice.tsx`:
reinstall `expo-audio`, bump `runtimeVersion`, swap the stub for the recorder,
ship an APK.
