# Porting guide — web client portal → native

Web source root:
`sheizen_saas/Sheizen_wellness/frontend/src/pages/sirah/client/`
API surface: `frontend/src/modules/workspace/api/clients.ts` (the `/me/*`
methods) — port the subset you need into `src/lib/clients-api.ts`.

## Method
1. Read the web screen + the `clientsApi.*` methods it calls.
2. Add those methods (+ types) to `src/lib/clients-api.ts`.
3. Rebuild the screen with RN primitives (`@/components/ui`) — don't port
   Tailwind/shadcn markup literally; keep the data logic, re-lay-out natively.
4. Replace the tab/route's `ComingSoon` stub with the real screen.
5. `npx tsc --noEmit` then `npx expo export -p android` to verify it bundles.

## Screen map

| Native route | Web source | Key API |
|---|---|---|
| `(tabs)/index.tsx` ✅ | `client/Home.tsx` | `home()`, `myMeals()`, `logHabit()`, `logMood()` |
| `(tabs)/meals.tsx` | `client/Meals.tsx`, `MealPlan.tsx`, `PlateVision.tsx` | `myMeals()`, meal logging, vision analyze |
| `(tabs)/assistant.tsx` | `client/WellnessAssistant.tsx` + `modules/assistant/*` | assistant chat endpoints |
| `(tabs)/progress.tsx` | `client/Progress.tsx`, `Measurements.tsx`, `Photos.tsx` | snapshot/habits history, measurements, photos |
| `(tabs)/chat.tsx` | `client/Chat.tsx` | `myMessages()`, `sendMessage()`, realtime (socket.io) |
| Wellbeing | `client/Wellbeing.tsx`, `Habits.tsx`, `Cycle.tsx` | habits, cycle events |
| Journal / Timeline | `client/Journal.tsx`, `Timeline.tsx` | journal + unified timeline |
| Goals / Programs / Assessments | `client/Goals.tsx`, `Programs.tsx`, `ProgramDetail.tsx`, `Assessments.tsx` | goals, program tasks, assessment forms |
| Recipes / Supplements | `client/Recipes.tsx`, `Supplements.tsx`, `Foods.tsx` | recipes, supplements, food lookup |
| Reports / Files | `client/Reports.tsx`, `Files.tsx` | reports, file up/download |
| Appointments | `client/Appointments.tsx` + `MeetingRoom.tsx` | appointments; video = Jitsi/Daily (needs native SDK) |
| Community | `client/Community.tsx` | community posts/challenges |
| Notifications | `client/Notifications.tsx` | notifications feed + push (expo-notifications) |
| Settings | `client/Settings.tsx` | profile update, preferences |

## Native-specific work to schedule
- **Push**: swap web `usePushNotifications` for `expo-notifications` + register
  the Expo push token with the backend.
- **Camera** (Plate Vision, meal/progress photos): `expo-camera` +
  `expo-image-picker`; upload to the same storage endpoint.
- **Realtime chat**: `socket.io-client` works in RN — port `lib/realtime.ts`,
  pointing at `EXPO_PUBLIC_API_BASE_URL`.
- **Video meetings**: web uses `@daily-co/daily-js` / Jitsi; use the Daily RN
  SDK or open the meeting URL in an in-app browser as an interim.
- **Deep links / onboarding**: web has `/portal/onboarding` + pending-approval
  gates — mirror them as routes before public release.
