# Firebase push — setup you do, then hand off to me

Goal: real push notifications (server-triggered, arrive when the app is closed).
FCM is **free**. You need a Google account. ~5–10 minutes.

The app's Android package name is **`in.sirahdigital.life`** — use it exactly.

---

## Part A — Create the Firebase project (you)

1. Go to **https://console.firebase.google.com** → **Add project**.
2. Name it e.g. **SIRAH LIFE** → Continue.
3. Google Analytics: **you can turn it OFF** (not needed for push) → Create project.

## Part B — Register the Android app (you)

4. On the project dashboard, click the **Android** icon ("Add app").
5. **Android package name:** `in.sirahdigital.life`  ← must match exactly.
6. App nickname: `SIRAH LIFE` (optional). SHA-1: **leave blank** (only needed for
   Google Sign-In, not for push).
7. Click **Register app**.
8. **Download `google-services.json`** — this is the file I need. Keep it.
9. You can skip the remaining "add SDK" steps — I handle those in the app.

## Part C — Get the server key so the backend can SEND (you)

10. In Firebase → gear icon → **Project settings** → **Service accounts** tab.
11. Click **Generate new private key** → confirm → it downloads a JSON file
    (e.g. `sirah-life-firebase-adminsdk-xxxx.json`).
12. This is a **secret** — it lets a server send push as your project. Do NOT
    commit it or paste it in chat. You'll place it on the VPS yourself (I'll tell
    you exactly where).

---

## Part D — Hand off to me

Give me:
- ✅ **`google-services.json`** (client config — safe, goes in the app repo build)
- ✅ The **project ID** and **sender ID** (shown in Project settings → General)

Keep private, place on the VPS yourself when I say:
- 🔒 the **service-account JSON** (server secret)

## What I do after you hand off

**App side (this repo):**
- Add `google-services.json`, configure the FCM channel in `app.json`.
- On login, register the device's FCM token and send it to the backend.
- Handle taps (open the right screen) and foreground display.
- Rebuild the signed APK/AAB.

**Backend side (your NestJS on the VPS — I write the code, you deploy):**
- A table/column to store each user's FCM token(s): `POST /me/push/device`.
- When a notification is created, also dispatch to FCM via the Firebase Admin
  SDK (using the service-account key from an env var / file on the VPS).
- Your existing web-push (VAPID) keeps working for the website in parallel.

> Note: the backend change touches your **production** service. I'll deliver it
> as a reviewable diff; you deploy it. I won't push to your VPS.

---

## FAQ
- **Is it free?** Yes — FCM push is free and unlimited on the Spark (free) plan.
- **Do I need Blaze/billing?** No, not for push.
- **iPhone?** Same idea but uses Apple's APNs + an Apple Developer account
  ($99/yr). We can do Android first, iOS later.
