#!/usr/bin/env bash
# =============================================================================
# Publish a new APK to the self-hosted download page.
#
#   bash ota-server/release-apk.sh "what changed"
#
# This is the NATIVE release path — use it when an OTA can't carry the change:
# a new native module, a permission, an SDK bump, or a device stuck on a bad
# bundle (a wedged app never asks the update server for anything, so only a
# reinstall recovers it).
#
# For JS/asset-only changes prefer ota-server/publish-ota.sh — silent, no
# reinstall.
#
# Mirrors exactly how sirah-life.apk has always been hosted:
#   /var/www/sirah/downloads/sirah-life.apk        <- served at /download/sirah-life.apk
#   /var/www/sirah/downloads/sirah-life.apk.prev   <- previous build, for rollback
#   /var/www/sirah/downloads/latest.json           <- what the in-app updater polls
# Those live OUTSIDE dist/ so a web deploy can't wipe them, and nginx aliases
# them above the SPA catch-all (see ota-server/nginx-ota.conf).
#
# Build the APK first:
#   cd android && ./gradlew assembleRelease
# =============================================================================
set -euo pipefail

NOTES="${1:-App update.}"

VPS_HOST="${VPS_HOST:-root@187.77.186.31}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/sirah_vps}"
REMOTE_DIR=/var/www/sirah/downloads
APK_LOCAL=android/app/build/outputs/apk/release/app-release.apk

VERSION="$(node -p "require('./app.json').expo.version")"
RUNTIME="$(node -p "require('./app.json').expo.runtimeVersion")"

[ -f "$APK_LOCAL" ] || { echo "!! $APK_LOCAL not found — run: cd android && ./gradlew assembleRelease"; exit 1; }

SIZE="$(node -p "require('fs').statSync('$APK_LOCAL').size")"
STAMP="$(node -p "new Date().toISOString().replace(/\.\d+Z$/,'Z')")"

echo "==> Releasing v$VERSION (runtime $RUNTIME, $((SIZE/1024/1024)) MB)"

# Sanity: the APK must be signed with the SAME key as the installed app, or
# Android refuses the in-place upgrade and users have to uninstall first.
echo "==> Signer fingerprint"
"${JAVA_HOME:-/c/Program Files/Android/Android Studio/jbr}/bin/keytool" \
  -printcert -jarfile "$APK_LOCAL" 2>/dev/null | grep -m1 "SHA256:" || echo "   (keytool unavailable — verify manually)"

# Back up the live APK — but ONLY when it's a DIFFERENT version to the one
# being published. Re-releasing the same version twice (a rebuild, a fixed
# config) would otherwise overwrite the last good rollback point with a variant
# of the very release you might need to roll back FROM, silently leaving you
# with no way back. Learned the hard way on 1.0.11.
echo "==> Backing up the current APK to .prev (rollback)"
LIVE_VER="$(curl -s https://nusi.sirahagents.com/download/latest.json | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).version}catch(e){''}" 2>/dev/null || echo '')"
if [ "$LIVE_VER" = "$VERSION" ]; then
  echo "   live is already v$VERSION — keeping the existing .prev (rollback point preserved)"
else
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" \
    "cp -f $REMOTE_DIR/sirah-life.apk $REMOTE_DIR/sirah-life.apk.prev 2>/dev/null || true"
  echo "   .prev now holds v${LIVE_VER:-unknown}"
fi

echo "==> Uploading APK"
# Upload beside the live file, then move into place — an interrupted transfer
# must never leave a half-written APK being served.
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$APK_LOCAL" "$VPS_HOST:$REMOTE_DIR/sirah-life.apk.tmp"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" \
  "mv -f $REMOTE_DIR/sirah-life.apk.tmp $REMOTE_DIR/sirah-life.apk"

echo "==> Writing latest.json (what the in-app updater polls)"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" "cat > $REMOTE_DIR/latest.json" <<JSON
{
  "version": "$VERSION",
  "url": "https://nusi.sirahagents.com/download/sirah-life.apk",
  "sizeBytes": $SIZE,
  "notes": "$NOTES",
  "publishedAt": "$STAMP"
}
JSON

echo "==> Verifying what the server now serves"
curl -s https://nusi.sirahagents.com/download/latest.json
echo
echo -n "   APK HTTP status + size: "
curl -sI https://nusi.sirahagents.com/download/sirah-life.apk | awk '/^HTTP|[Cc]ontent-[Ll]ength/ {printf "%s ", $0}'
echo
echo "✅ Released v$VERSION. Existing installs will be prompted by the in-app updater."
echo "   Rollback: ssh in and 'mv $REMOTE_DIR/sirah-life.apk.prev $REMOTE_DIR/sirah-life.apk' + restore latest.json version."
