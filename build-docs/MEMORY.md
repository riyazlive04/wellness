# Project memory

## Decisions
- BP tracking: two lab markers (`bp_systolic`, `bp_diastolic`) in a `vitals` panel, no new table — reuses the labs module (trends, permissions, self-logging, charting). Rejected a single text marker and a dedicated BP table. See `features/blood-pressure.md`.
- Weight chart keeps direction-of-travel colouring, not clinical bands (no universal healthy weight). BP gets bands (published adult normal range exists).
- Backdating: unrestricted into the past, capped at today (no future dates).
- AI credits are metered strictly per real AI/Gemini call (`ai_usage_events` row), never for deterministic math (IFCT-2017 calorie/macro calculation is free on every plan).
- Over AI quota: degrade to deterministic fallback (e.g. rule-based Plate Vision insight), never hard-block logging. `checkQuota()` fails open on lookup error.
- Workspace creation is self-serve only (`POST /api/v1/workspaces`, owner's own JWT becomes `owner_id`). No super-admin "create workspace for customer" endpoint exists; plan starts as `trial` unless caller is a super admin.

## Constraints
- `SELF_PLAUSIBLE` range checks are per-marker, not a single sugar-shaped range — adding a marker type must extend this or readings get wrongly rejected.
- Program task completion (`program_task_logs`) is a pure boolean toggle; no media/file column exists today.

## Open items
- BP entry card + chart on frontend (backend done, frontend pending per `features/blood-pressure.md`).
- Exercise/meditation demo-video proof-of-completion on program tasks — identified as a real gap, not yet scoped as a feature doc.
- "Additional food/supplement recommended" as a distinct log entry — currently only supplements have a dedicated entity; no equivalent for ad-hoc extra food.

## Known issues
None currently tracked beyond the open items above.
