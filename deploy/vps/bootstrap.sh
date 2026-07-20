#!/usr/bin/env bash
# =============================================================================
# SIRAH LIFE — one-shot VPS bootstrap (Hostinger KVM 2, Ubuntu, run as root).
#
# It is IDEMPOTENT and runs in two passes:
#   Pass 1  — installs packages, swap, firewall, clones the repo, then creates
#             the two .env files from templates and STOPS so you can fill your
#             secrets.
#   Pass 2  — (after you edit the env files) builds backend + frontend, wires
#             Nginx + pm2, gets the HTTPS cert, and health-checks.
#
# Usage on the server:
#   1) Put this repo on the box (see REPO_URL below) OR paste this file to
#      /root/bootstrap.sh, then: bash /root/bootstrap.sh
#   2) When it stops, edit the two env files it names, then re-run the same
#      command. Done.
# =============================================================================
set -euo pipefail

# ─────────────── EDIT THESE THREE, then run ───────────────
DOMAIN="nusi.sirahagents.com"
# Private repo? Use a token URL: https://<TOKEN>@github.com/riyazlive04/wellness.git
REPO_URL="https://github.com/riyazlive04/wellness.git"
REPO_BRANCH="main"        # set to a deploy branch to avoid touching Render/Vercel prod
CERTBOT_EMAIL="riyazlivechat@gmail.com"
# ──────────────────────────────────────────────────────────

APP_DIR="/var/www/sirah"
DVPS="$APP_DIR/deploy/vps"
log() { echo -e "\n\033[1;36m==> $*\033[0m"; }

# 1) System packages ---------------------------------------------------------
# Base packages are installed unconditionally (idempotent — safe on a shared
# box that already has some of them). Node is only installed if missing/old, so
# an existing newer Node used by OTHER apps on the box is left untouched.
log "Ensuring base packages (nginx, git, certbot, build tools)"
apt-get update
apt-get install -y curl ca-certificates git nginx build-essential certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]; then
  log "Installing Node 20 (none/old found)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  log "Node $(node -v) already present — leaving it (other apps may depend on it)"
fi

command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# 2) Firewall, swap, log dir -------------------------------------------------
log "Firewall + swap + logs"
ufw allow OpenSSH      >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
ufw --force enable     >/dev/null 2>&1 || true
mkdir -p /var/log/sirah
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10 >/dev/null
fi

# 3) Code --------------------------------------------------------------------
mkdir -p /var/www
if [ -d "$APP_DIR/.git" ]; then
  log "Updating repo ($REPO_BRANCH)"; git -C "$APP_DIR" fetch origin "$REPO_BRANCH" && git -C "$APP_DIR" checkout "$REPO_BRANCH" && git -C "$APP_DIR" pull --ff-only origin "$REPO_BRANCH"
else
  log "Cloning repo ($REPO_BRANCH)"; git clone -b "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi

# 4) Env gate — stop on first pass so you can paste secrets -------------------
BE_ENV="$APP_DIR/backend/.env"
FE_ENV="$APP_DIR/frontend/.env.production"
NEED=0
[ -f "$BE_ENV" ] || { cp "$APP_DIR/backend/.env.production.example" "$BE_ENV"; NEED=1; }
[ -f "$FE_ENV" ] || { cp "$APP_DIR/frontend/.env.production.example" "$FE_ENV"; NEED=1; }
if [ "$NEED" = 1 ]; then
  chmod 600 "$BE_ENV"
  cat <<EOF

============================================================================
ACTION NEEDED — fill in your (rotated!) secrets, then re-run this script.

  nano $BE_ENV
    PORT=3000
    FRONTEND_ORIGIN=https://$DOMAIN
    DATABASE_URL / DIRECT_URL / SUPABASE_URL / SUPABASE_JWT_SECRET
    SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY / VAPID_* / GOOGLE_OAUTH_*

  nano $FE_ENV
    VITE_SUPABASE_URL=https://<project-ref>.supabase.co
    VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
    VITE_API_BASE_URL=https://$DOMAIN

Then re-run:  bash $DVPS/bootstrap.sh
============================================================================
EOF
  exit 0
fi

# 5) Build backend -----------------------------------------------------------
log "Building backend"
cd "$APP_DIR/backend"
npm install --include=dev
npx prisma generate
npm run build

# 6) Build frontend (extra heap headroom for the Vite build) -----------------
log "Building frontend"
cd "$APP_DIR/frontend"
npm install --include=dev
NODE_OPTIONS=--max-old-space-size=3072 npm run build

# 7) Nginx (single-host: static + /api proxy) --------------------------------
log "Configuring Nginx"
cp "$DVPS/nginx-websocket-map.conf" /etc/nginx/conf.d/websocket-map.conf
sed "s/nusi\.sirahagents\.com/$DOMAIN/g" "$DVPS/nginx-nusi.conf" > "/etc/nginx/sites-available/$DOMAIN"
ln -sf "/etc/nginx/sites-available/$DOMAIN" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 8) pm2 (backend process + boot-persistence) --------------------------------
log "Starting backend under pm2"
cd "$APP_DIR"
pm2 start "$DVPS/ecosystem.config.cjs" 2>/dev/null || pm2 reload sirah-backend --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

# 9) HTTPS -------------------------------------------------------------------
log "Requesting HTTPS certificate"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect \
  || echo "certbot failed — confirm DNS ($DOMAIN) points to this box, then: certbot --nginx -d $DOMAIN"

# 10) Health -----------------------------------------------------------------
log "Health check"
sleep 3
if curl -fsS "https://$DOMAIN/api/v1/health" >/dev/null; then
  echo -e "\n\033[1;32m✔ DEPLOY OK — https://$DOMAIN\033[0m"
else
  echo -e "\n\033[1;33m! Health check failed. Inspect: pm2 logs sirah-backend\033[0m"
fi
