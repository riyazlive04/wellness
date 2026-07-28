# Google Play — Data Safety form answers (draft)

Play Console → App content → Data safety. Answer truthfully — Google cross-checks
against app behaviour and rejects mismatches. Below reflects what the app does
today. Adjust `<…>` and re-verify before submitting.

## Overview answers
- **Does your app collect or share user data?** → **Yes**
- **Is all data encrypted in transit?** → **Yes** (HTTPS to the API + Supabase)
- **Do you provide a way to request data deletion?** → **Yes** — provide a
  deletion URL/route (see privacy policy §8). You must set an **Account deletion
  URL** in Play Console.

## Data types collected
For each: collected = Yes; purpose = **App functionality** (and **Account
management** where noted); shared with third parties = see notes; processed
ephemerally = No; user can request deletion = Yes.

| Data type | Collected | Shared* | Required? | Notes |
|---|---|---|---|---|
| Name | Yes | No | Required | Account & profile |
| Email address | Yes | No | Required | Login (Supabase auth) |
| Phone number | Yes | No | Optional | Profile |
| User IDs | Yes | No | Required | Account identifier |
| **Health & fitness** (meals, weight, measurements, habits, mood, cycle, symptoms, assessments) | Yes | No | Optional per feature | Core purpose |
| **Photos** (meal photos) | Yes | No | Optional | Plate Vision; sent to server for analysis + review |
| Messages (in-app) | Yes | No | Optional | Chat with your practice |
| App interactions | Yes | No | Optional | Basic functionality |
| Crash logs / diagnostics | `<Yes if you add Sentry, else No>` | — | — | Only if configured |

\* "Shared" in Google's sense = transferred to a **third party**. Your hosting/
AI/database providers acting on your behalf generally count as **processors, not
sharing** — but AI providers (e.g. Gemini) may count as sharing depending on
their data use. Confirm each provider's terms and answer accordingly. If meal
photos or text go to an AI provider that may retain them, mark those types as
**Shared**.

## Security practices
- Data encrypted in transit: **Yes**
- Users can request deletion: **Yes**
- Committed to Play Families Policy: **No** (not a children's app)
- Independent security review: `<No / Yes if applicable>`

## Sensitive-data reminder
This app handles **health data**, one of Google's most scrutinised categories.
Make sure:
1. Health data collection is clearly justified in the listing and policy.
2. You do NOT use health data for ads or sell it (you don't).
3. Permissions (CAMERA, POST_NOTIFICATIONS) are each justified in the listing.
