# SIRAH LIFE — VPS deployment (native: Nginx + pm2, Supabase stays managed)

This runs the whole app on one Linux box:

```
                          ┌────────────────────────── your VPS ──────────────────────────┐
   Browser  ──HTTPS──▶    │  Nginx (443)                                                   │
                          │   ├─ app.sirahdigital.in ─▶ static files  frontend/dist/       │
                          │   └─ api.sirahdigital.in ─▶ proxy 127.0.0.1:3000 (NestJS/pm2)  │
                          └───────────────────────────────┬───────────────────────────────┘
                                                          │
                                        Supabase (managed): Postgres + Auth  ◀── unchanged
```

Nginx serves the built frontend and reverse-proxies the API. The NestJS backend runs under pm2. **Supabase stays where it is** — the box only runs the app.

> Assumes Ubuntu 22.04/24.04 with a sudo-capable user. If your VPS is a different distro, the package names differ but the steps are identical. Replace `sirahdigital.in` with your real domain everywhere.

> **Sized for Hostinger KVM 1 (1 vCPU · 4 GB RAM · ~50 GB NVMe).** Plenty at runtime. The one caveat is *build time*: the Vite frontend build can OOM on 4 GB with no swap — §2 adds swap to prevent that. Builds are also slow on 1 vCPU (a few minutes) — that's normal.

---

## ► YOUR DEPLOYMENT — locked values (single host)

This install is a **single hostname** that serves the frontend AND proxies `/api` to the backend (no CORS). Where the generic steps below use `app.`/`api.` placeholders, use these instead:

| | Value |
|---|---|
| **Target box** | Hostinger **KVM 2** (2 vCPU · 8 GB · 100 GB), Ubuntu |
| **VPS IP** | `187.77.186.31` |
| **Hostname** | `nusi.sirahagents.com` (single host — frontend + `/api` proxy) |
| **DNS record** | `A   nusi   187.77.186.31`  (in the `sirahagents.com` zone) |
| **Nginx config** | use **`nginx-nusi.conf`** — NOT the `nginx-app.conf` / `nginx-api.conf` pair |
| **Backend `.env`** | `PORT=3000`, `FRONTEND_ORIGIN=https://nusi.sirahagents.com` |
| **Frontend `.env.production`** | `VITE_API_BASE_URL=https://nusi.sirahagents.com` |
| **TLS** | `sudo certbot --nginx -d nusi.sirahagents.com` |
| **Supabase / Google OAuth** | single origin: `https://nusi.sirahagents.com` |

**Step overrides for single-host:**
- **§1 DNS** — add just **one** A-record (`nusi → 187.77.186.31`), not two.
- **§6 Nginx** — install `nginx-websocket-map.conf` + **`nginx-nusi.conf`** only:
  ```bash
  cd /var/www/sirah/deploy/vps
  sudo cp nginx-websocket-map.conf /etc/nginx/conf.d/websocket-map.conf
  sudo cp nginx-nusi.conf /etc/nginx/sites-available/nusi.sirahagents.com
  sudo ln -sf /etc/nginx/sites-available/nusi.sirahagents.com /etc/nginx/sites-enabled/
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl reload nginx
  ```
- **§7 TLS** — `sudo certbot --nginx -d nusi.sirahagents.com` (one name).
- **8 GB RAM** — the swap in §2 is optional here (nice safety net), builds won't OOM.

> ⚠️ **Renew KVM 2 before go-live** — it expires **2026-07-25**. Don't put production on a box that lapses in a week.

---

## 0. Before you start — rotate leaked secrets ⚠️

Per the project notes, these were pasted in chat and **must be rotated before this goes live**: Supabase **DB password**, **JWT secret**, **service-role key**, **Gemini API key**, **Google OAuth secret**. Rotate them in Supabase / Google Cloud / Google AI Studio first, then use the fresh values in the env files below. Don't deploy the old ones.

---

## 1. Subdomains & DNS (the recommended split)

Use **two subdomains, one box**. This mirrors your current Vercel(frontend) + Render(backend) split, so no code changes are needed — the frontend already targets the API by URL and the backend already has a CORS allowlist.

| Subdomain | Serves | Points at |
|---|---|---|
| `app.sirahdigital.in` | Frontend SPA | your VPS IP |
| `api.sirahdigital.in` | Backend API + WebSocket | your VPS IP |

**DNS records** (at your domain registrar / DNS host) — replace `203.0.113.10` with your VPS IPv4:

```
A   app   203.0.113.10
A   api   203.0.113.10
```

(If you have IPv6, add `AAAA` records too.) Wait for propagation (`dig app.sirahdigital.in +short` should return your IP).

> **Why not one domain?** You *could* serve the frontend at `app.…` and proxy `/api` on the same origin (zero CORS). But the two-subdomain split matches how the app is already wired and keeps frontend/backend independently debuggable. Stick with two unless you have a reason not to.

---

## 2. Prepare the server (one time)

```bash
# Node 20 LTS (backend requires >=20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Nginx, git, certbot, build tools
sudo apt-get install -y nginx git build-essential
sudo apt-get install -y certbot python3-certbot-nginx

# pm2 (process manager) globally
sudo npm install -g pm2

# Firewall: allow SSH + web only
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Log dir for pm2 (matches ecosystem.config.cjs)
sudo mkdir -p /var/log/sirah && sudo chown "$USER":"$USER" /var/log/sirah

# --- Swap (IMPORTANT on KVM 1 / any 4 GB box) ---------------------------------
# Prevents the frontend build from being OOM-killed. Skip if you already have swap
# (`swapon --show` prints a row) or more than ~8 GB RAM.
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # persist across reboot
  sudo sysctl vm.swappiness=10                                  # prefer RAM, use swap only under pressure
fi
```

---

## 3. Get the code

```bash
sudo mkdir -p /var/www && sudo chown "$USER":"$USER" /var/www
cd /var/www
git clone <YOUR_REPO_URL> sirah      # → /var/www/sirah
cd /var/www/sirah
```

Layout on the box:
- Repo: `/var/www/sirah`
- Backend: `/var/www/sirah/backend` (runs on port 3000)
- Frontend build: `/var/www/sirah/frontend/dist`

---

## 4. Backend — env, build, run

**4a. Create `/var/www/sirah/backend/.env`** from the template and fill real values:

```bash
cd /var/www/sirah/backend
cp .env.production.example .env
nano .env
```

Must-set keys (see `.env.production.example` for the full list):

```ini
NODE_ENV=production
PORT=3000
# CORS allowlist — comma-separated. Put the frontend origin here.
FRONTEND_ORIGIN=https://app.sirahdigital.in

# Supabase (managed) — pooler for the app, direct for migrations
DATABASE_URL=postgresql://...:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://...:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET=<rotated>
SUPABASE_SERVICE_ROLE_KEY=<rotated>

GEMINI_API_KEY=<rotated>
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=<rotated>

# Web push — generate once: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@sirahdigital.in

# Optional integrations — leave unset until wired (Razorpay, Resend, Evolution, Sentry, Redis…)
```

> The backend **validates env on boot** and reads `backend/.env` automatically. If a required var is missing it will refuse to start (check `pm2 logs`).

**4b. Build:**

```bash
cd /var/www/sirah/backend
npm install --include=dev
npx prisma generate
npm run build          # → dist/main.js
```

**4c. Start under pm2 + enable on boot:**

```bash
cd /var/www/sirah
pm2 start deploy/vps/ecosystem.config.cjs
pm2 save
pm2 startup            # run the sudo command it prints, then `pm2 save` again
```

Quick local check (before Nginx/TLS):
```bash
curl -s http://127.0.0.1:3000/api/v1/health
```

---

## 5. Frontend — env, build

The API URL and Supabase keys are baked in **at build time**, so set them before building.

```bash
cd /var/www/sirah/frontend
cp .env.production.example .env.production
nano .env.production
```

```ini
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key — safe to expose>
VITE_API_BASE_URL=https://api.sirahdigital.in
```

```bash
npm install --include=dev
npm run build          # → /var/www/sirah/frontend/dist
```

> Change any of these later? You must **rebuild** — they're compiled into the bundle, not read at runtime.

> **KVM 1 build memory:** with the 2 GB swap from §2 this build should complete (slowly). If it still dies with *"JavaScript heap out of memory"*, give Node more headroom for the build:
> ```bash
> NODE_OPTIONS=--max-old-space-size=3072 npm run build
> ```
> Last-resort alternative: build `frontend/dist` on your laptop (`npm run build` with the same `.env.production`) and copy it up — `rsync -az frontend/dist/ user@server:/var/www/sirah/frontend/dist/`. This skips on-box building entirely.

---

## 6. Nginx

```bash
cd /var/www/sirah/deploy/vps

# WebSocket upgrade map (http-level, needed by the api server block)
sudo cp nginx-websocket-map.conf /etc/nginx/conf.d/websocket-map.conf

# Server blocks
sudo cp nginx-app.conf /etc/nginx/sites-available/app.sirahdigital.in
sudo cp nginx-api.conf /etc/nginx/sites-available/api.sirahdigital.in
sudo ln -sf /etc/nginx/sites-available/app.sirahdigital.in /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/api.sirahdigital.in /etc/nginx/sites-enabled/

# (optional) drop the default site
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

At this point `http://app.sirahdigital.in` should load the app and `http://api.sirahdigital.in/api/v1/health` should return OK.

---

## 7. HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d app.sirahdigital.in -d api.sirahdigital.in
```

Certbot edits both server blocks to add `443` + redirects HTTP→HTTPS, and installs a renewal timer. Verify renewal: `sudo certbot renew --dry-run`.

> Web push and service workers **require HTTPS** — don't skip this.

---

## 8. Wire the external services to the new domains

- **Supabase → Auth → URL Configuration:** set **Site URL** to `https://app.sirahdigital.in` and add it to **Redirect URLs** (needed for magic links, OAuth, password reset).
- **Google Cloud Console → OAuth client:** add `https://app.sirahdigital.in` (and `https://api.sirahdigital.in` if the callback is server-side) to **Authorized JavaScript origins** and the correct **Authorized redirect URI**.
- **Razorpay dashboard → Webhooks:** point the webhook at your API subdomain's billing webhook endpoint on `https://api.sirahdigital.in/...` and set `RAZORPAY_WEBHOOK_SECRET` to match. (Leave Razorpay unset until you're ready — billing degrades gracefully.)
- **Supabase → allowed origins / CORS** (if you use any browser-side Supabase calls beyond auth): add the app origin.

---

## 9. Verify

```bash
curl -s https://api.sirahdigital.in/api/v1/health          # OK
pm2 status                                                  # sirah-backend online
```
Then in a browser: open `https://app.sirahdigital.in`, sign in, and confirm data loads (that proves frontend → api → Supabase end-to-end). Check DevTools console for CORS errors (means `FRONTEND_ORIGIN` doesn't match the app origin — fix in `backend/.env`, then `pm2 reload sirah-backend`).

---

## 10. Redeploys (every future update)

```bash
bash /var/www/sirah/deploy/vps/deploy.sh
```
It pulls, rebuilds backend + frontend, reloads pm2 + Nginx, and health-checks. (Requires the deploy user to have passwordless `sudo nginx`/`systemctl reload nginx`, or run those two lines manually.)

---

## 11. Security checklist

- [ ] Rotated all leaked secrets (§0) — old ones are burned.
- [ ] `ufw` enabled: only SSH + Nginx open. Backend port 3000 is **not** exposed (proxy only).
- [ ] SSH hardened: key-only auth, root login disabled.
- [ ] `backend/.env` is `chmod 600` and never committed.
- [ ] HTTPS live on both subdomains; auto-renew tested.
- [ ] `pm2 save` + `pm2 startup` done, so the API survives reboots.
- [ ] (Optional) `fail2ban` for SSH, and Sentry (`SENTRY_DSN`) for error tracking.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Browser console CORS error | `FRONTEND_ORIGIN` ≠ the app's real origin. Fix `backend/.env`, `pm2 reload sirah-backend`. |
| 502 Bad Gateway on api | Backend down or wrong port. `pm2 logs sirah-backend`; confirm it listens on 3000. |
| Blank page / 404 on refresh of a deep link | SPA fallback missing — confirm `nginx-app.conf` `try_files … /index.html` is in place. |
| Realtime/notifications not live | WebSocket not upgrading — confirm `websocket-map.conf` is in `/etc/nginx/conf.d/` and `nginx -t` passes. |
| Backend won't boot | Missing/invalid env var (it validates on boot). `pm2 logs sirah-backend` shows which one. |
| API changes to `VITE_*` not taking effect | You must **rebuild** the frontend — those are compile-time. |
