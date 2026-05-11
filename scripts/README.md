# scripts — operational utilities

One-shot maintenance scripts. Each script must:

1. Default to `--dry-run` (no side effects unless `--commit` is passed)
2. Print exactly what it will do before doing it
3. Refuse to run against the production Supabase project unless `SHEIZEN_ALLOW_PROD=1` is exported

## Planned scripts

| Script | Purpose |
|---|---|
| `seed-dev.ts` | Insert synthetic test data into the dev Supabase project |
| `migrate-feature.ts` | Helper for the per-feature migration recipe (FE call → backend endpoint flip) |
| `rotate-keys.ts` | Walk the user through rotating Gemini / Supabase / VAPID keys |
| `audit-secrets.ts` | Pre-commit scanner for accidentally-staged secrets |
| `verify-isolation.ts` | Confirms the running app talks to the correct Supabase project |

## What does NOT belong here

The old root-level scripts (now in `_legacy_scripts/`) hit the production database. Anything resembling that is forbidden. If a script needs to write to a real DB, it goes through the backend API.
