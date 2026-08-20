#!/usr/bin/env bash
# =============================================================================
# Publish an over-the-air JS update to the self-hosted Expo Updates server.
#
#   bash ota-server/publish-ota.sh "what changed"
#
# Ships JS/asset changes to already-installed apps SILENTLY — no APK, no
# reinstall, no Android install dialog. The app fetches it on next launch.
#
# Only works for JS/asset changes against the CURRENT runtimeVersion. If you
# changed native code (added a permission/module, bumped SDK), you must build a
# new APK instead — bump runtimeVersion in app.json and this update won't (and
# must not) be offered to the old runtime.
#
# Run from the mobile project root (D:\dev\sirah-mobile) on your PC.
# =============================================================================
set -euo pipefail

NOTES="${1:-JS update.}"

# Production moved to a new VPS on 2026-08-06; 187.77.186.31 is retired and
# only 301-redirects to nusi.in. Publishing there uploads successfully to a
# host no app ever reads from - a silent no-op that looks like a release.
VPS_HOST="${VPS_HOST:-root@187.127.119.27}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/nusi_in_vps}"
REMOTE_UPDATES_DIR=/var/www/sirah/ota/updates

# runtimeVersion MUST match app.json expo.runtimeVersion and the installed APK.
RUNTIME_VERSION="$(node -p "require('./app.json').expo.runtimeVersion")"
PLATFORM=android
STAMP="$(node -p 'Date.now()')"
STAGE=".ota-stage/$STAMP"

echo "==> Exporting JS bundle (runtime $RUNTIME_VERSION)"
rm -rf "$STAGE" dist-ota
npx expo export --platform "$PLATFORM" --output-dir dist-ota >/dev/null

echo "==> Generating expoConfig.json (adds extra.expoClient)"
npx expo config --json --type public > dist-ota/expoConfig.json

echo "==> Normalising metadata.json paths (Windows '\\' -> '/')"
# The export runs on Windows, so asset paths use backslashes. The Linux server
# would fail to open them. Rewrite to forward slashes here, once.
node ota-server/normalize-metadata.js dist-ota/metadata.json

echo "==> Staging update $STAMP"
mkdir -p "$STAGE"
cp -r dist-ota/_expo "$STAGE/"
cp -r dist-ota/assets "$STAGE/" 2>/dev/null || true
cp dist-ota/metadata.json "$STAGE/"
cp dist-ota/expoConfig.json "$STAGE/"

echo "==> Uploading to $VPS_HOST:$REMOTE_UPDATES_DIR/$RUNTIME_VERSION/$STAMP"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" "mkdir -p $REMOTE_UPDATES_DIR/$RUNTIME_VERSION"
# scp the whole staged dir. -r preserves the _expo/assets layout the server reads.
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r "$STAGE" "$VPS_HOST:$REMOTE_UPDATES_DIR/$RUNTIME_VERSION/$STAMP"

echo "==> Recording release note"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" \
  "printf '%s\n' \"$NOTES\" > $REMOTE_UPDATES_DIR/$RUNTIME_VERSION/$STAMP/NOTES.txt"

echo "==> Verifying the server now offers it"
curl -s -H "expo-platform: android" -H "expo-runtime-version: $RUNTIME_VERSION" -H "expo-protocol-version: 1" \
  "https://nusi.in/updates/manifest" -o /dev/null -w "   manifest HTTP %{http_code}  (%{size_download} bytes)\n" || true

rm -rf "$STAGE"
echo "✅ Published OTA update $STAMP for runtime $RUNTIME_VERSION"
echo "   Installed apps on runtime $RUNTIME_VERSION will pick it up on next launch."
