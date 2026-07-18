#!/usr/bin/env bash
# =============================================================================
# Rebuild + reload SIRAH LIFE after pulling new code. Run as the deploy user
# (the one that owns /var/www/sirah and runs pm2). Idempotent & safe to re-run.
#
#   bash /var/www/sirah/deploy/vps/deploy.sh
# =============================================================================
set -euo pipefail

APP_DIR="/var/www/sirah"
API_HEALTH="https://nusi.sirahagents.com/api/v1/health"

cd "$APP_DIR"

echo "==> [1/5] Pulling latest code"
git pull --ff-only

echo "==> [2/5] Backend: install deps, generate Prisma client, build"
cd "$APP_DIR/backend"
npm install --include=dev
npx prisma generate
npm run build

echo "==> [3/5] Frontend: install deps, build (reads frontend/.env.production)"
cd "$APP_DIR/frontend"
npm install --include=dev
npm run build

echo "==> [4/5] Reload backend (pm2) + nginx"
pm2 reload sirah-backend --update-env
sudo nginx -t && sudo systemctl reload nginx

echo "==> [5/5] Health check"
if curl -fsS "$API_HEALTH" >/dev/null; then
  echo "OK — backend healthy at $API_HEALTH"
else
  echo "WARNING — health check failed. Check: pm2 logs sirah-backend"
  exit 1
fi

echo "==> Deploy complete."
