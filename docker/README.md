# docker — container definitions

All Dockerfiles and compose manifests live here. Source code stays in `frontend/` and `backend/`.

## Files (planned)

| File | Purpose |
|---|---|
| `frontend.Dockerfile` | Multi-stage build for the Vite frontend (dev + prod targets) |
| `backend.Dockerfile` | Multi-stage build for the NestJS backend (dev + prod targets) |
| `docker-compose.dev.yml` | Local dev: frontend + backend + redis + worker |
| `docker-compose.prod.yml` | Production: same services, prod targets, secrets via env_file |
| `caddy/Caddyfile` | Reverse-proxy config (TLS, `/api/*` → backend, `/*` → frontend static) |

## Notes

- Postgres is **not** in compose — it lives in Supabase.
- Redis is local only (or managed in prod via Upstash/Render Redis).
- Frontend in prod is a static bundle served by Caddy, not a Node server.
