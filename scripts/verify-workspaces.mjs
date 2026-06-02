import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV = await readFile(join(resolve(__dirname, '..'), 'backend', '.env.local'), 'utf8');
const url = ENV.split(/\r?\n/).find((l) => l.startsWith('DIRECT_URL=')).slice(11).replace(/^["']|["']$/g, '');

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

async function q(sql, name) {
  const { rows } = await c.query(sql);
  console.log(`\n=== ${name} ===`);
  console.dir(rows, { depth: null });
}

await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema='public' AND table_name='workspaces' ORDER BY ordinal_position`,
        'workspaces columns');

await q(`SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name='workspace_members' ORDER BY ordinal_position`,
        'workspace_members columns');

await q(`SELECT enumlabel FROM pg_enum
         WHERE enumtypid = 'public.app_role'::regtype ORDER BY enumsortorder`,
        'app_role values');

await q(`SELECT enumlabel FROM pg_enum
         WHERE enumtypid = 'public.workspace_member_role'::regtype ORDER BY enumsortorder`,
        'workspace_member_role values');

await q(`SELECT policyname, cmd FROM pg_policies
         WHERE schemaname='public' AND tablename IN ('workspaces','workspace_members')`,
        'RLS policies');

await q(`SELECT proname FROM pg_proc WHERE proname='current_workspace_id'`,
        'current_workspace_id() exists');

await c.end();
