# Feature — Video scripts (Super Admin)

**Status:** built 2026-11-14 — migration not yet applied
**Route:** `/admin/video-scripts` · **Nav:** Operations, beside "Call script"
**Scope:** Sirah Digital operators only. Not a tenant feature, not plan-gated, never exposed to a workspace.

---

## Purpose

The 50 marketing video scripts live in `films/sirah-life/*.md` and are readable only by someone with the repo checked out and a local server running. The people who commission, shoot and brief these videos are operators working in the admin console, not developers.

This puts the library where the work happens — beside Leads and the demo-call SOP, which is the same job (selling NUSI) at a different stage of the funnel.

**Editable in the browser** was chosen over bundling the scripts as a static TS file: scripts get revised after every shoot and every ad test, and a redeploy per wording change is not a workable loop for a marketer.

## Architecture

### Data model — one new table

`public.video_scripts` — platform-owned, **no `workspace_id`**. This is Sirah Digital's own content, like `leads`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `number` | int unique | 1–50, the script's stable identifier. Drives display order. |
| `title` | text | e.g. "Six Tabs" |
| `bucket` | int | 1–10, the strategic angle |
| `bucket_title` | text | denormalised, e.g. "The Tool Stack Bleed" |
| `duration_seconds` | int | 30 / 60 / 100 / 120 / 150 / 180 |
| `kind` | text null | the parenthetical, e.g. "VSL", "brand film" |
| `avatar` | text null | who it is aimed at |
| `hook_type` | text null | e.g. "Visual pattern-interrupt" |
| `lines` | jsonb | `[{ n, vo, on_screen }]` — the shot table |
| `status` | text | `draft` · `ready` · `produced` · `retired`. Default `draft`. |
| `notes` | text null | operator notes, not part of the script |
| `created_at` / `updated_at` | timestamptz | |

`lines` is **jsonb, not a child table**: a script's lines are only ever read and written as a whole document, never queried or joined individually. A `video_script_lines` table would buy nothing and cost a join plus ordering logic on every read.

### RLS

Deny-all to authenticated users. Reads and writes go through the API under `@SuperAdmin()`, exactly as `leads` does. RLS is the second layer, not the gate.

### API — `backend/src/admin/admin-video-scripts.controller.ts`

All routes `@SuperAdmin()` + `@Audit(...)`, mounted on the existing `admin.module.ts`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/admin/video-scripts` | list (optional `?bucket=`, `?status=`, `?q=`) |
| GET | `/api/v1/admin/video-scripts/:id` | one script |
| POST | `/api/v1/admin/video-scripts` | create |
| PATCH | `/api/v1/admin/video-scripts/:id` | update (partial) |
| DELETE | `/api/v1/admin/video-scripts/:id` | delete |
| POST | `/api/v1/admin/video-scripts/import` | seed/replace from the parsed markdown payload |

### Frontend — `frontend/src/pages/sirah/admin/AdminVideoScripts.tsx`

Follows `AdminLeads.tsx` conventions: `AdminHeader`, `Glass` from `@/design-system`, `sonner` for toasts, `@tanstack/react-query` for fetching, optimistic updates on save.

Layout mirrors the local preview that was built at `films/sirah-life/index.html`, because that arrangement has already been reviewed:
- Left rail — all scripts grouped by bucket, number + title + duration.
- Main — one card per script: number badge, title, duration pill, use-case pill, avatar/hook line, then the VO / ON SCREEN table.
- Top — search across all text, filters (All / 30s / 60s / Long), and a status filter.
- Each line is editable in place; a script saves as a whole document.
- Copy-script button (copies VO column as plain text for a voice artist).

### Seeding

A one-off script parses `films/sirah-life/SCRIPTS_*.md` into the import payload. The markdown files remain the origin, but after import the **database is the source of truth** — the `.md` files are not re-read, and divergence is expected and fine.

## Impact map

| Touches | What could break |
|---|---|
| `supabase/migrations/` (new file) | New table only. No existing table altered. Nothing to break. |
| `backend/src/admin/admin.module.ts` | Adding a controller to the providers array — a missed registration means 404s on the new routes only. |
| `backend/src/database` (Prisma schema) | New model. Requires `prisma generate`; a stale client breaks the build, not runtime. |
| `frontend/src/App.tsx` | One lazy import + one `<Route>`. A typo in the path yields a blank route; no other route is affected. |
| `frontend/src/modules/super-admin/SuperAdminLayout.tsx` | One nav item in the Operations group. Risk is cosmetic (wrong group / icon). |
| `films/sirah-life/*.md` | Read once by the seeder. Unchanged by this feature. |
| Audit log | New action types appear in `/admin/compliance`. Expected, not a regression. |
| **Tenant surfaces** | **None.** No workspace, client, billing or plan code is touched. |

## Edge cases and failure modes

- **Non-super-admin hits the route** → `@SuperAdmin()` rejects; RLS denies underneath. The nav item is not rendered for them either.
- **`lines` arrives malformed** (not an array, missing `vo`) → DTO validation rejects before write. A script with zero lines is allowed (a stub being drafted).
- **Duplicate `number`** → unique constraint; API returns a clear conflict rather than silently creating a second "Script 07".
- **Very long VO line** → `vo` and `on_screen` capped at 2,000 chars each; the table cell wraps rather than overflows.
- **Concurrent edit by two operators** → last write wins. Acceptable: this is a 2–3 person internal tool, not collaborative editing. `updated_at` is shown so a surprise is visible.
- **Import run twice** → upsert on `number`, so re-import is idempotent and does not duplicate the library.
- **Empty state** (table seeded but import never run) → the page explains how to import rather than rendering a blank rail.
- **Script deleted by mistake** → no soft delete in v1. ⚠️ Noted as a known limitation; the markdown originals remain in the repo as a backup.

## Acceptance criteria

1. A super admin sees "Video scripts" in the Operations nav group and can open `/admin/video-scripts`.
2. A non-super-admin cannot see the nav item, and a direct GET to the API returns 403.
3. All 50 scripts import from the markdown files, grouped into their 10 buckets, in number order.
4. Searching "plate vision" filters to only the scripts whose VO or on-screen text contains it.
5. Filtering to 30s shows only 30-second scripts; the rail filters in step with the main list.
6. Editing a VO line and saving persists across a reload.
7. Changing a script's status to `produced` persists and is filterable.
8. Creating a script with a `number` that already exists is rejected with a clear message, not a 500.
9. Every create / update / delete writes an audit-log entry.
10. The page is usable at 1280px and does not horizontally scroll at phone width.

## Resolved

- **`status` is operator metadata only.** It gates nothing and triggers nothing in v1. If a future export should filter on `ready`, that is a new change.
- **Brand corrections were applied to the markdown before import** (2026-11-14), so the repo originals are correct and the DB did not inherit 50 scripts naming a product that does not ship. See `TESTING.md` for the full list.
- **Trial carries the Growth feature set: verified true.** `backend/src/common/features.ts:119` sets `trial: GROWTH_FEATURES`. The claim is safe to speak in a film.

## Still open

- Migration not applied, so acceptance criteria 1, 2 and 4–10 are unverified. Apply it, run the seeder, then POST the payload to `/api/v1/admin/video-scripts/import`.
- No soft delete in v1 — a mistaken delete relies on the markdown originals as backup. Add `deleted_at` if that proves uncomfortable in use.
