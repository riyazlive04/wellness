# SIRAH LIFE — Client Mobile App

Native iOS + Android app for the **SIRAH LIFE client portal** (the `/portal/*`
experience of the web app), built with Expo (SDK 57) + expo-router. It talks to
the **same** production backend as the web app: Supabase for auth/data and the
NestJS API for everything else, so a client uses one login across web and mobile.

This is a **from-scratch React Native rewrite** of the client dashboard — not a
webview wrapper. Owner/admin surfaces are intentionally excluded.

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
    _layout.tsx              # providers (SafeArea, QueryClient, Auth) + auth gate
    index.tsx                # splash → redirect
    (auth)/login.tsx         # Supabase email/password sign-in
    (tabs)/                  # the app shell (5 tabs + More)
      index.tsx              # Today  (ported, live data)
      meals / assistant / progress / chat / more
  components/
    ui/index.tsx             # Screen, Card, AppText, GradientButton, ...
    score-ring.tsx           # SVG wellness-score ring
    coming-soon.tsx          # placeholder for un-ported screens
  contexts/auth-context.tsx  # Supabase session + role (ported from web)
  lib/
    supabase.ts              # RN client (AsyncStorage-backed session)
    api.ts                   # fetch wrapper, injects Supabase JWT ({data,meta})
    clients-api.ts           # /me/* endpoints (ported subset)
    theme.ts / query-client.ts
  hooks/use-theme.ts         # light/dark theme resolver (dark-first)
```

Auth + data reuse the web contracts verbatim, so ported screens behave
identically. Theming is ported from the web design tokens (blue → teal → cyan,
dark-first).

## Porting status

The web client portal has ~28 screens. This foundation ships the shell + one
real screen; the rest are stubbed with a "coming soon" placeholder so every tab
is navigable.

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
