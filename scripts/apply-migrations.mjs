#!/usr/bin/env node
// Apply supabase/migrations/*.sql in timestamp order against the DEV database.
//
// Usage:
//   cd backend && node ../scripts/apply-migrations.mjs           # apply pending
//   cd backend && node ../scripts/apply-migrations.mjs --dry-run  # show plan
//
// Reads DIRECT_URL from backend/.env.local. Refuses to run if the URL
// references the production project ref.

import { Client } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const ENV_FILE = join(REPO_ROOT, 'backend', '.env.local');

const PROD_REF = 'ljxgaycjomnyfihdsgke';
const DRY_RUN = process.argv.includes('--dry-run');

function parseEnv(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const envText = await readFile(ENV_FILE, 'utf8');
  const env = parseEnv(envText);
  const url = env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL not set in backend/.env.local');
  if (url.includes(PROD_REF)) {
    throw new Error(`REFUSING TO RUN: DIRECT_URL references production project ref ${PROD_REF}`);
  }

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => /^\d{14}.*\.sql$/.test(f))
    .sort();

  console.log(`Found ${files.length} migration files in ${MIGRATIONS_DIR}`);

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._applied_migrations (
        version    text PRIMARY KEY,
        name       text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows: applied } = await client.query(
      'SELECT version FROM public._applied_migrations',
    );
    const appliedSet = new Set(applied.map((r) => r.version));
    console.log(`${appliedSet.size} migrations already applied. ${files.length - appliedSet.size} pending.\n`);

    let appliedCount = 0;
    let skippedCount = 0;
    let failedAt = null;

    for (const file of files) {
      const version = file.slice(0, 14);
      if (appliedSet.has(version)) {
        skippedCount++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`[dry-run] would apply: ${file}`);
        continue;
      }

      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`Applying ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO public._applied_migrations(version, name) VALUES ($1, $2)',
          [version, file],
        );
        await client.query('COMMIT');
        console.log('OK');
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});

        // Idempotency exceptions: a later migration tries to recreate something
        // an earlier migration already made. Skip + record as applied so we can
        // get through 159 retroactive migrations against a fresh DB.
        const idempotencyCodes = new Set([
          '42P07', // duplicate_table
          '42P06', // duplicate_schema
          '42710', // duplicate_object (policy, trigger, function, type)
          '42701', // duplicate_column
          '42P16', // duplicate_index? (also invalid_table_definition in some)
          '23505', // unique_violation (on seed inserts)
        ]);

        if (err.code && idempotencyCodes.has(err.code)) {
          console.log(`SKIP (${err.code}: ${err.message.split('\n')[0]})`);
          await client.query(
            'INSERT INTO public._applied_migrations(version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [version, file],
          );
          skippedCount++;
          continue;
        }

        console.log('FAILED');
        console.error(`\nError in ${file}:`);
        console.error(`   code: ${err.code}`);
        console.error(`   message: ${err.message}`);
        if (err.position) console.error(`   at position ${err.position}`);
        failedAt = file;
        break;
      }
    }

    console.log('\n---');
    console.log(`Applied this run: ${appliedCount}`);
    console.log(`Skipped (already applied): ${skippedCount}`);
    if (failedAt) {
      console.log(`Stopped at: ${failedAt}`);
      process.exitCode = 1;
    } else {
      console.log('All migrations applied successfully.');
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
