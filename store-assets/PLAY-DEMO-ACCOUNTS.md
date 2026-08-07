# SIRAH LIFE — Play Store review: demo accounts & seed data

Google Play reviewers must be able to log in and see a **working, populated** app
(a login wall with an empty account is the #1 cause of "app doesn't function" / login
rejections). Create the two accounts below on **production** and seed them so a reviewer
sees real content within 30 seconds of signing in.

Backend/app both point at production: `https://nusi.sirahagents.com`.

---

## The two accounts to create

| Role | Purpose | Email | Password |
|------|---------|-------|----------|
| **Nutritionist (owner)** | Shows the coach/owner side — dashboard, clients, programs, billing (read-only), etc. | `demo.coach@sirahdigital.in` | `SirahDemo!2026` |
| **Client** | Shows the client side — Living Garden home, meals, habits, progress, achievements. | `demo.client@sirahdigital.in` | `SirahDemo!2026` |

> Use these exact values (or your own — just keep them in sync with the Play Console
> "App access" text at the bottom). One shared password keeps it simple for reviewers.
> Pick a mailbox you control for `@sirahdigital.in`, **or** swap to two Gmail aliases like
> `sirahdigital+democoach@gmail.com` / `sirahdigital+democlient@gmail.com` — Gmail `+`
> aliases all land in your one inbox, so email verification still works.

---

## How to create them (use the real signup flow — do NOT hand-insert into the DB)

Signup wires up Supabase auth + the workspace + role rows correctly; manual SQL misses
those. Do it once on prod:

1. **Nutritionist:** open the web app → **Sign up** → register `demo.coach@…`. This
   creates a new workspace with the coach as owner. Complete onboarding (practice name:
   e.g. "Sirah Demo Nutrition", pick the default/trial plan — trial is fine for review).
2. **Client:** from inside the coach account, **invite** `demo.client@…` as a client
   (Clients → Add/Invite). Accept the invite / set the password so the client can log in.
   This links the client to the demo coach's workspace — which is what makes both sides
   show connected data.

---

## Seed checklist (so neither side looks empty)

Do this while logged in as the **coach**, then a little as the **client**.

**As the coach (owner side):**
- [ ] Practice/workspace name set, profile photo optional.
- [ ] The demo client appears under **Clients** (from the invite above).
- [ ] Assign the client a **Program** (any template → assign) so the client's "Program"
      column isn't "Awaiting onboarding" and the owner dashboard momentum ring has data.
- [ ] Create **1 upcoming appointment** with the client (Scheduling) → makes the dashboard
      "Upcoming sessions" card populate.
- [ ] Send the client **1 message** (so the client's inbox isn't empty).
- [ ] (Optional) Add **1 physical product** in Shop so the client's store isn't blank.

**As the client:**
- [ ] Log **1–2 meals** (use the meal photo / manual add) → home + Meals populate.
- [ ] Tap water / sleep / move a couple times → habit rings fill, **Living Garden** grows.
- [ ] Add **1 habit** and check it → progress + achievements start.
- [ ] Log for the day → an achievement/streak appears on the Progress screen.

That's enough for a reviewer to see: login works → real dashboard → client data →
core loop (log a meal, water the garden). ~10 minutes of seeding total.

---

## Paste this into Play Console → App content → "App access"

Choose **"All or some functionality is restricted"** → add these two instructions:

**Instruction 1 — Nutritionist (coach) account**
```
Login required. Use the demo coach account.
Username: demo.coach@sirahdigital.in
Password: SirahDemo!2026
Notes: This is the nutritionist/owner side. After login you'll see the coach
dashboard, the connected demo client, an assigned program, and an upcoming session.
```

**Instruction 2 — Client account**
```
Login required. Use the demo client account.
Username: demo.client@sirahdigital.in
Password: SirahDemo!2026
Notes: This is the end-user/client side. After login you'll see the home "Living
Garden", logged meals, habit rings, and the progress/achievements screen.
```

> Keep both accounts **active and seeded** until the app is live and through review.
> If you rotate the password later, update it here too or the next update review fails.

---

## Notes
- Payments in the app are for **physical goods / real-world services** (Razorpay) — no
  in-app digital purchases — so reviewers won't hit a Play Billing block. Nothing to buy
  is required for review; the Shop can stay optional.
- If a reviewer flags "couldn't sign in", it's almost always email verification or an
  expired demo account — re-verify the two mailboxes before resubmitting.
