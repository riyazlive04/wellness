#!/usr/bin/env node
// Create a SIRAH LIFE super_admin user out-of-band.
//
// Usage:
//   node scripts/create-super-admin.mjs --email admin@sirahdigital.in --password ChangeMe123!
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DIRECT_URL from
// backend/.env.local. Calls Supabase Admin API to create the auth user
// (with email_confirm=true so no inbox round-trip), then inserts a
// public.user_roles row with role='super_admin'.
//
// Idempotent — re-running with the same email is safe (returns existing
// user, ensures user_roles row exists).

import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(resolve(__dirname, '..'), 'backend', '.env.local');

function parseEnv(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email')    out.email    = argv[++i];
    else if (a === '--password') out.password = argv[++i];
  }
  return out;
}

const { email, password } = parseArgs(process.argv.slice(2));
if (!email || !password) {
  console.error('Usage: node scripts/create-super-admin.mjs --email <email> --password <password>');
  process.exit(2);
}

const env = parseEnv(await readFile(ENV_PATH, 'utf8'));
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DIRECT_URL  = env.DIRECT_URL;
if (!SUPABASE_URL || !SERVICE_KEY || !DIRECT_URL) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DIRECT_URL in backend/.env.local');
  process.exit(2);
}

// ── 1. Create or fetch the auth user ──────────────────────────────────────
async function adminApi(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.msg || json?.message || json?.error_description || text;
    throw new Error(`Supabase admin API ${res.status}: ${msg}`);
  }
  return json;
}

console.log(`→ Creating/finding auth user ${email}...`);
let userId;
try {
  const created = await adminApi('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  userId = created.id;
  console.log(`  created with id ${userId}`);
} catch (err) {
  // If "already registered" — look it up via the list endpoint and continue.
  if (/already (been )?registered|email.*exists/i.test(err.message)) {
    console.log('  user already exists, looking up id...');
    const list = await adminApi(`/auth/v1/admin/users?filter=email.eq.${encodeURIComponent(email)}`);
    const found = (list?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!found) throw new Error(`User exists but couldn't fetch id for ${email}`);
    userId = found.id;
    console.log(`  found existing user id ${userId}`);
  } else {
    throw err;
  }
}

// ── 2. Insert user_roles row for super_admin ──────────────────────────────
console.log(`→ Granting super_admin role to ${userId}...`);
const pg = new Client({ connectionString: DIRECT_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
try {
  await pg.query(
    `INSERT INTO public.user_roles (user_id, role)
     VALUES ($1, 'super_admin'::public.app_role)
     ON CONFLICT (user_id, role) DO NOTHING`,
    [userId],
  );
  const { rows } = await pg.query(
    `SELECT role::text AS role FROM public.user_roles WHERE user_id = $1 ORDER BY role`,
    [userId],
  );
  console.log(`  ${email} now has roles: ${rows.map(r => r.role).join(', ')}`);
} finally {
  await pg.end();
}

console.log('\n✅ Done.');
console.log(`   email:    ${email}`);
console.log(`   password: ${password}`);
console.log('   Sign in at http://localhost:4000/auth and you should land on /admin.');
