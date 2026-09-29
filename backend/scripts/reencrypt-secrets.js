/**
 * Re-encrypt stored workspace secrets with the current key (CONNECTIONS_ENC_KEY).
 *
 * Run from backend/ after a build, once CONNECTIONS_ENC_KEY is set:
 *   node scripts/reencrypt-secrets.js           # dry run: counts only
 *   node scripts/reencrypt-secrets.js --apply   # write
 *
 * Covers practice AI keys and the encrypted fields in workspace_connections
 * (Resend apiKey_enc, Evolution token_enc). Values already on the current key
 * are left alone, so it is safe to re-run. Prints counts, never secrets.
 */
const fs = require('fs');
const path = require('path');

// Same files, same precedence as the app's ConfigModule (.env.local, then .env).
for (const file of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');
const { decryptSecretDetailed, encryptSecret } = require('../dist/connections/secret-crypto');

const APPLY = process.argv.includes('--apply');
const CONNECTION_FIELDS = ['apiKey_enc', 'token_enc'];

async function main() {
  if (!process.env.CONNECTIONS_ENC_KEY) {
    throw new Error('CONNECTIONS_ENC_KEY is not set - nothing to move to.');
  }
  const db = new PrismaClient();
  const tally = { checked: 0, current: 0, reencrypted: 0, unreadable: 0 };

  const reseal = (enc) => {
    tally.checked++;
    try {
      const { plain, current } = decryptSecretDetailed(enc);
      if (current) { tally.current++; return null; }
      tally.reencrypted++;
      return encryptSecret(plain);
    } catch {
      tally.unreadable++;
      return null;
    }
  };

  const keys = await db.$queryRawUnsafe('SELECT workspace_id, key_enc FROM public.workspace_ai_keys');
  for (const row of keys) {
    const next = reseal(row.key_enc);
    if (next && APPLY) {
      await db.$executeRawUnsafe(
        'UPDATE public.workspace_ai_keys SET key_enc = $2, updated_at = now() WHERE workspace_id = $1::uuid',
        row.workspace_id, next,
      );
    }
  }

  const conns = await db.$queryRawUnsafe('SELECT workspace_id, channel, config FROM public.workspace_connections');
  for (const row of conns) {
    const config = row.config || {};
    let changed = false;
    for (const field of CONNECTION_FIELDS) {
      if (typeof config[field] !== 'string') continue;
      const next = reseal(config[field]);
      if (next) { config[field] = next; changed = true; }
    }
    if (changed && APPLY) {
      await db.$executeRawUnsafe(
        'UPDATE public.workspace_connections SET config = $3::jsonb, updated_at = now() WHERE workspace_id = $1::uuid AND channel = $2',
        row.workspace_id, row.channel, JSON.stringify(config),
      );
    }
  }

  await db.$disconnect();
  console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}:`, tally);
  if (tally.unreadable) process.exitCode = 2;
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
