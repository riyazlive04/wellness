import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV = await readFile(join(resolve(__dirname, '..'), 'backend', '.env.local'), 'utf8');
const url = ENV.split(/\r?\n/).find((l) => l.startsWith('DIRECT_URL=')).slice(11).replace(/^["']|["']$/g, '');

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  SELECT table_name
    FROM information_schema.columns
   WHERE table_schema='public' AND column_name='workspace_id'
   ORDER BY table_name
`);

console.log(`Tables with workspace_id (${rows.length}):`);
rows.forEach((r) => console.log(`  - ${r.table_name}`));

await c.end();
