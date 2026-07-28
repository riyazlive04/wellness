# SIRAH LIFE — self-hosted OTA update server

Ships **JavaScript/asset** changes to already-installed apps **silently** — no
APK reinstall, no Android install dialog. The app fetches the update on next
launch and applies it. Implements the [Expo Updates protocol v1](https://docs.expo.dev/technical-specs/expo-updates-1/)
with **zero npm dependencies** (pure Node).

## When OTA works vs. when you need a new APK

| Change | Ship with |
|---|---|
| Styling, screens, text, logic, API calls, bug fixes in JS | **`publish-ota.sh`** (silent) |
| New native permission or module, SDK bump, icon/splash change | **new APK** (bump `runtimeVersion`) |

`runtimeVersion` (app.json → `expo.runtimeVersion`, currently **"1"**) is the
compatibility key. An OTA bundle is only offered to an installed app whose
runtime matches. Change native code → bump `runtimeVersion` → build a new APK;
old installs simply won't be offered the incompatible JS.

## Pieces

- `server.js` — the update server. Env: `PORT` (4747), `UPDATES_DIR`,
  `PRIVATE_KEY_PATH`, `PUBLIC_HOSTNAME`.
- `publish-ota.sh` — run on your PC: exports the JS, normalises Windows paths,
  uploads a timestamped bundle to the VPS. The server always serves the newest.
- `normalize-metadata.js` — rewrites Windows `\` asset paths to `/` (the Linux
  server can't open backslash paths — same trap as the dist.zip deploy bug).
- `nginx-ota.conf` — the `location /updates/` proxy block.

## Security — the signing key

Updates are **code-signed**. The private key (`keys/private-key.pem`) proves an
update genuinely came from you; the certificate (`certs/certificate.pem`) is
baked into the app and verifies the signature. The app **rejects** any unsigned
or wrongly-signed update.

- The private key is **gitignored**. It lives only on your PC and on the VPS at
  `/etc/sirah/ota-private-key.pem`.
- **Back it up** alongside the release keystore. If you lose it you can't sign
  updates, and because the cert is embedded in the shipped APK you'd need a
  whole new APK release to rotate to a new key.

## First-time VPS setup

```sh
# 1. server + key (key is a secret — 600, root-only)
scp -i ~/.ssh/sirah_vps ota-server/server.js root@VPS:/var/www/sirah/ota/server.js
scp -i ~/.ssh/sirah_vps keys/private-key.pem root@VPS:/etc/sirah/ota-private-key.pem
ssh -i ~/.ssh/sirah_vps root@VPS 'chmod 600 /etc/sirah/ota-private-key.pem'

# 2. run under pm2
ssh -i ~/.ssh/sirah_vps root@VPS 'PORT=4747 \
  UPDATES_DIR=/var/www/sirah/ota/updates \
  PRIVATE_KEY_PATH=/etc/sirah/ota-private-key.pem \
  PUBLIC_HOSTNAME=https://nusi.sirahagents.com \
  pm2 start /var/www/sirah/ota/server.js --name sirah-ota && pm2 save'

# 3. add nginx-ota.conf's location block above the SPA catch-all, then:
ssh -i ~/.ssh/sirah_vps root@VPS 'nginx -t && systemctl reload nginx'
```

## Publish an update

```sh
bash ota-server/publish-ota.sh "what changed"
```

Then open the app twice: the first launch downloads the update in the
background, the second launch runs it. (`checkAutomatically: ON_LOAD` +
`fallbackToCacheTimeout: 0` — we never block the splash on the network.)
