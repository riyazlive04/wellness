# SIRAH LIFE — Production deploy runbook

Promotes everything on `feat/sirah-announcements-branding-perf` (8 commits: branding,
billing/Module 3, AI assistant/Module 6, Wellness OS/7, Program Engine/8, barcode,
Modules 9–12) to production.

- **Prod DB:** Supabase `ljxgaycjomnyfihdsgke` (already hosted/live)
- **Backend:** Render `sirah-backend`, auto-deploys on push to `main`
- **Frontend:** Vercel (deploys on push to `main` if connected)

> ⚠️ **Order is mandatory.** The new backend code queries tables that don't exist on
> prod yet (`ai_*`, `team_*`, `program_*`, `wellness_*`, `assistant_*`, `barcode_products`,
> `billing_notifications`). If the backend deploys **before** the DB migration, those
> features return 500 on a live app. **DB first, then push to `main`.**

---

## Step 1 — Migrate the prod DB (do this FIRST)

1. Open Supabase → project `ljxgaycjomnyfihdsgke` → **SQL Editor** → **New query**.
2. Paste the entire contents of [`PROD_DEPLOY.sql`](./PROD_DEPLOY.sql) and **Run**.
   - It's wrapped in one `BEGIN; … COMMIT;` — any error rolls back the whole bundle.
   - Every statement is `IF NOT EXISTS` / `ON CONFLICT` guarded, so it's safe even if a
     migration was already partially applied. Re-running it is a no-op.
3. **Post-check** — run this; all 21 rows should come back `true`:

```sql
SELECT tbl, to_regclass('public.'||tbl) IS NOT NULL AS exists FROM (VALUES
 ('billing_notifications'),('assistant_conversations'),('assistant_messages'),
 ('assistant_memory'),('assistant_actions'),('wellness_goals'),('wellness_habits'),
 ('wellness_habit_logs'),('wellness_journal'),('program_templates'),
 ('program_template_tasks'),('program_assignments'),('program_assignment_tasks'),
 ('program_task_logs'),('barcode_products'),('team_channels'),('team_messages'),
 ('team_notes'),('ai_recommendations'),('ai_governance_actions'),('ai_feedback')
) AS t(tbl);
```

Also confirm the two additive columns landed:

```sql
SELECT 'announcements.target_roles' AS col, count(*) FROM information_schema.columns
  WHERE table_name='announcements' AND column_name='target_roles'
UNION ALL
SELECT 'workspaces.branding', count(*) FROM information_schema.columns
  WHERE table_name='workspaces' AND column_name='branding';
```

✅ When every row exists, tell me **"migrations applied"** and I push `main`.

---

## Step 2 — Set Render env vars (before/at deploy)

Render → `sirah-backend` → **Environment**. These power features in this release:

| Key | Needed for | If missing |
|-----|-----------|-----------|
| `GEMINI_API_KEY` | AI assistant, Plate Vision, Module 12 recos, smart-replies | AI endpoints 500 |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Module 3 billing, subscriptions | Billing 500 |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook → `/api/v1/webhooks/razorpay` | Webhook rejects |

(The Supabase/DB/JWT/OAuth vars are already set since the app is hosted.)

---

## Step 3 — Deploy backend (I run this on your "go")

After you confirm Step 1:

```
git checkout main
git merge --no-ff feat/sirah-announcements-branding-perf
git push origin main      # ← Render auto-deploys (autoDeploy: true)
```

Render runs: `npm install --include=dev && npx prisma generate && npm run build`,
then `node dist/main.js`. Watch the deploy log; health check is `/api/v1/health`.

---

## Step 4 — Frontend

If Vercel is connected to this repo's `main`, it deploys automatically on the same push.
Confirm `VITE_API_URL` / API base points at the Render backend URL.

---

## Step 5 — Rotate leaked credentials (post-deploy, do not skip)

These were pasted in chat during development and must be rotated:
DB password · Supabase JWT secret · service-role key · Gemini API key · Google OAuth secret.
Rotate in each provider, then update the values in Render env (and Supabase Auth for OAuth).

---

## Rollback

- **Backend:** Render → Deploys → roll back to the previous deploy (instant).
- **DB:** the bundle is purely additive (no `DROP`, no column changes to existing data).
  Nothing existing is mutated, so a backend rollback alone restores prior behavior; the
  new empty tables can stay harmlessly.
