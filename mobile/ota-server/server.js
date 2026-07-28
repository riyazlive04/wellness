'use strict';
/**
 * Self-hosted Expo Updates server (protocol v1) for SIRAH LIFE.
 *
 * Serves over-the-air JavaScript updates to the sideloaded app so JS/asset
 * changes reach users silently on next launch — no APK reinstall, no Android
 * install dialog. Native changes (new permissions/modules, SDK bumps) still
 * need a new APK; those bump `runtimeVersion` and this server simply won't
 * offer a JS update to an incompatible runtime.
 *
 * Implements https://docs.expo.dev/technical-specs/expo-updates-1/ directly,
 * modelled on expo/custom-expo-updates-server, but with ZERO npm dependencies:
 * the multipart body, the RSA-SHA256 signature, the SFV signature header and
 * the MIME table are all small enough to inline, so there is nothing to
 * `npm install` on the VPS and no supply chain to keep patched.
 *
 * Layout it reads (produced by publish-ota.sh):
 *   <UPDATES_DIR>/<runtimeVersion>/<timestamp>/
 *       metadata.json          (from `expo export`, paths normalised to '/')
 *       _expo/static/js/<platform>/<entry>.hbc
 *       assets/<hash>
 *       expoConfig.json         (optional; adds extra.expoClient)
 *
 * Env:
 *   PORT             (default 4747)
 *   UPDATES_DIR      (default ./updates)      root of the layout above
 *   PRIVATE_KEY_PATH (required for signing)   RSA private key (PEM)
 *   PUBLIC_HOSTNAME  (default https://nusi.sirahagents.com) base for asset URLs
 */
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '4747', 10);
const UPDATES_DIR = path.resolve(process.env.UPDATES_DIR || 'updates');
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH || '';
const PUBLIC_HOSTNAME = (process.env.PUBLIC_HOSTNAME || 'https://nusi.sirahagents.com').replace(/\/+$/, '');

// Minimal MIME table — only the asset types this app actually ships. Anything
// unknown falls back to application/octet-stream (the client keys off the hash,
// not the content type, for integrity).
const MIME = {
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', json: 'application/json',
  js: 'application/javascript', xml: 'application/xml',
};
const mimeFor = (ext) => MIME[String(ext).toLowerCase().replace(/^\./, '')] || 'application/octet-stream';

const base64url = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = (buf, enc) => crypto.createHash('sha256').update(buf).digest(enc);
const md5hex = (buf) => crypto.createHash('md5').update(buf).digest('hex');

/** UUID string from a 32-char hex hash, per the Expo spec. */
function hashToUUID(hex) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function signRSASHA256(data) {
  if (!PRIVATE_KEY_PATH) return null;
  const key = fs.readFileSync(path.resolve(PRIVATE_KEY_PATH), 'utf8');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data, 'utf8');
  sign.end();
  return sign.sign(key, 'base64');
}

/**
 * Serialize {sig, keyid} as a Structured-Field dictionary: sig="...", keyid="main".
 * Base64 uses only chars valid inside an SFV string, so no escaping is needed —
 * this reproduces structured-headers' serializeDictionary for this exact shape.
 */
function serializeSignature(sig) {
  return `sig="${sig}", keyid="main"`;
}

/**
 * Newest update for a runtime version, returned as a path RELATIVE to
 * UPDATES_DIR (e.g. "1/1785236944867"). Dirs are millisecond timestamps.
 * Kept relative so asset URLs don't leak the server's absolute filesystem path.
 */
async function latestBundleRel(runtimeVersion) {
  const rtDir = path.join(UPDATES_DIR, runtimeVersion);
  if (!fs.existsSync(rtDir)) throw new Error('Unsupported runtime version');
  const entries = await fsp.readdir(rtDir);
  const dirs = [];
  for (const e of entries) {
    const st = await fsp.stat(path.join(rtDir, e));
    if (st.isDirectory()) dirs.push(e);
  }
  if (!dirs.length) throw new Error('No update found for runtime version');
  dirs.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  return `${runtimeVersion}/${dirs[0]}`;
}

async function readMetadata(bundleRel) {
  const p = path.join(UPDATES_DIR, bundleRel, 'metadata.json');
  const buf = await fsp.readFile(p);
  const st = await fsp.stat(p);
  return {
    metadataJson: JSON.parse(buf.toString('utf8')),
    // mtime, not birthtime: birthtime is unreliable on Linux filesystems and
    // can come back as the epoch, which would make every update look ancient.
    createdAt: new Date(st.mtime).toISOString(),
    id: sha256(buf, 'hex'),
  };
}

async function readExpoConfig(bundleRel) {
  try {
    const buf = await fsp.readFile(path.join(UPDATES_DIR, bundleRel, 'expoConfig.json'));
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return null; // optional — the spec doesn't require extra.expoClient
  }
}

/**
 * Resolve an asset path (relative to UPDATES_DIR) to an absolute file, refusing
 * anything that escapes UPDATES_DIR. `metadata.json` written on Windows carries
 * backslash paths (assets\\<hash>), so normalise to '/' first.
 */
function safeResolve(relFromUpdatesDir) {
  const normalised = String(relFromUpdatesDir).replace(/\\/g, '/');
  const abs = path.resolve(UPDATES_DIR, normalised);
  if (abs !== UPDATES_DIR && !abs.startsWith(UPDATES_DIR + path.sep)) {
    throw new Error('Asset path escapes updates directory');
  }
  return abs;
}

async function assetMetadata({ bundleRel, filePath, ext, isLaunchAsset, runtimeVersion, platform }) {
  // Path relative to UPDATES_DIR — this is what goes in the URL and what the
  // assets endpoint resolves. Keeps the server's absolute path out of URLs.
  const rel = `${bundleRel}/${String(filePath).replace(/\\/g, '/')}`;
  const buf = await fsp.readFile(safeResolve(rel));
  return {
    hash: base64url(sha256(buf, 'base64')),
    key: md5hex(buf),
    fileExtension: isLaunchAsset ? '.bundle' : `.${ext}`,
    contentType: isLaunchAsset ? 'application/javascript' : mimeFor(ext),
    url: `${PUBLIC_HOSTNAME}/updates/assets?asset=${encodeURIComponent(rel)}&runtimeVersion=${encodeURIComponent(runtimeVersion)}&platform=${encodeURIComponent(platform)}`,
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

/** Build and write the multipart/mixed manifest response the client expects. */
function writeMultipartManifest(res, manifestString, signature, protocolVersion) {
  const boundary = crypto.randomBytes(18).toString('hex');
  const partHeaders =
    `content-disposition: form-data; name="manifest"\r\n` +
    `content-type: application/json; charset=utf-8\r\n` +
    (signature ? `expo-signature: ${signature}\r\n` : '');
  const body = Buffer.from(
    `--${boundary}\r\n${partHeaders}\r\n${manifestString}\r\n--${boundary}--\r\n`,
    'utf8',
  );
  res.writeHead(200, {
    'expo-protocol-version': String(protocolVersion),
    'expo-sfv-version': '0',
    'cache-control': 'private, max-age=0',
    'content-type': `multipart/mixed; boundary=${boundary}`,
  });
  res.end(body);
}

async function handleManifest(req, res, u) {
  const h = req.headers;
  const protocolVersion = parseInt(h['expo-protocol-version'] || '0', 10);
  const platform = h['expo-platform'] || u.searchParams.get('platform');
  if (platform !== 'ios' && platform !== 'android') return sendJson(res, 400, { error: 'Unsupported platform.' });

  const runtimeVersion = h['expo-runtime-version'] || u.searchParams.get('runtime-version');
  if (!runtimeVersion) return sendJson(res, 400, { error: 'No runtimeVersion provided.' });

  let bundleRel;
  try {
    bundleRel = await latestBundleRel(runtimeVersion);
  } catch (e) {
    return sendJson(res, 404, { error: e.message });
  }

  const { metadataJson, createdAt, id } = await readMetadata(bundleRel);

  // Protocol v1: if the client already runs this update, say so explicitly so
  // it stops asking, rather than re-downloading the same bundle.
  const uuid = hashToUUID(id);
  if (protocolVersion === 1 && h['expo-current-update-id'] === uuid) {
    const directive = JSON.stringify({ type: 'noUpdateAvailable' });
    const sig = h['expo-expect-signature'] ? serializeSignature(signRSASHA256(directive)) : null;
    return writeMultipartDirective(res, directive, sig);
  }

  const perPlatform = metadataJson.fileMetadata[platform];
  if (!perPlatform) return sendJson(res, 404, { error: `No ${platform} bundle in this update.` });

  const expoConfig = await readExpoConfig(bundleRel);
  const manifest = {
    id: uuid,
    createdAt,
    runtimeVersion,
    launchAsset: await assetMetadata({ bundleRel, filePath: perPlatform.bundle, ext: null, isLaunchAsset: true, runtimeVersion, platform }),
    assets: await Promise.all(
      (perPlatform.assets || []).map((a) =>
        assetMetadata({ bundleRel, filePath: a.path, ext: a.ext, isLaunchAsset: false, runtimeVersion, platform }),
      ),
    ),
    metadata: {},
    extra: expoConfig ? { expoClient: expoConfig } : {},
  };

  const manifestString = JSON.stringify(manifest);
  const signature = h['expo-expect-signature'] ? serializeSignature(signRSASHA256(manifestString)) : null;
  if (h['expo-expect-signature'] && !signature) {
    return sendJson(res, 400, { error: 'Code signing requested but server has no private key.' });
  }
  writeMultipartManifest(res, manifestString, signature, protocolVersion);
}

function writeMultipartDirective(res, directiveString, signature) {
  const boundary = crypto.randomBytes(18).toString('hex');
  const partHeaders =
    `content-disposition: form-data; name="directive"\r\n` +
    `content-type: application/json; charset=utf-8\r\n` +
    (signature ? `expo-signature: ${signature}\r\n` : '');
  const body = Buffer.from(`--${boundary}\r\n${partHeaders}\r\n${directiveString}\r\n--${boundary}--\r\n`, 'utf8');
  res.writeHead(200, {
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
    'cache-control': 'private, max-age=0',
    'content-type': `multipart/mixed; boundary=${boundary}`,
  });
  res.end(body);
}

async function handleAssets(req, res, u) {
  const assetName = u.searchParams.get('asset');
  const runtimeVersion = u.searchParams.get('runtimeVersion');
  const platform = u.searchParams.get('platform');
  if (!assetName) return sendJson(res, 400, { error: 'No asset name provided.' });
  if (platform !== 'ios' && platform !== 'android') return sendJson(res, 400, { error: 'Bad platform.' });
  if (!runtimeVersion) return sendJson(res, 400, { error: 'No runtimeVersion provided.' });

  let bundleRel;
  try {
    bundleRel = await latestBundleRel(runtimeVersion);
  } catch (e) {
    return sendJson(res, 404, { error: e.message });
  }

  const { metadataJson } = await readMetadata(bundleRel);
  const relInBundle = assetName.replace(`${bundleRel}/`, '').replace(/\\/g, '/');
  const isLaunch = String(metadataJson.fileMetadata[platform].bundle).replace(/\\/g, '/') === relInBundle;
  const meta = (metadataJson.fileMetadata[platform].assets || []).find(
    (a) => String(a.path).replace(/\\/g, '/') === relInBundle,
  );

  let abs;
  try {
    abs = safeResolve(assetName); // assetName is relative to UPDATES_DIR
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }
  if (!fs.existsSync(abs)) return sendJson(res, 404, { error: `Asset "${assetName}" does not exist.` });

  const buf = await fsp.readFile(abs);
  res.writeHead(200, {
    'content-type': isLaunch ? 'application/javascript' : mimeFor(meta ? meta.ext : ''),
    'cache-control': 'public, max-age=31536000, immutable', // assets are content-hashed
  });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname.replace(/^\/updates/, '') || '/';
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Expected GET.' });
    if (p === '/manifest') return await handleManifest(req, res, u);
    if (p === '/assets') return await handleAssets(req, res, u);
    if (p === '/health') return sendJson(res, 200, { status: 'ok', updatesDir: UPDATES_DIR, signing: !!PRIVATE_KEY_PATH });
    return sendJson(res, 404, { error: 'Not found.' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: String((err && err.message) || err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ota] listening on 127.0.0.1:${PORT}  updates=${UPDATES_DIR}  signing=${!!PRIVATE_KEY_PATH}`);
});
