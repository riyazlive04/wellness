import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV = await readFile(join(resolve(__dirname, '..'), 'backend', '.env.local'), 'utf8');
const url = ENV.split(/\r?\n/).find((l) => l.startsWith('DIRECT_URL=')).slice(11).replace(/^["']|["']$/g, '');

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: superAdmins } = await c.query(`
  SELECT u.email, u.id, ur.role
    FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
   WHERE ur.role::text = 'super_admin'
`);

const { rows: workspaces } = await c.query(`
  SELECT w.name, w.plan, u.email AS owner_email, w.status, w.created_at
    FROM public.workspaces w
    JOIN auth.users u ON u.id = w.owner_id
   ORDER BY w.created_at ASC
`);

const { rows: clients } = await c.query(`
  SELECT u.email, ur.role
    FROM auth.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
   WHERE ur.role::text = 'client'
`);

console.log('\n=== 🔱 SUPER ADMINS (Sirah Digital staff) ===');
if (superAdmins.length === 0) console.log('  (none yet)');
else superAdmins.forEach((r) => console.log(`  ${r.email}`));

console.log('\n=== 🏥 WORKSPACES (nutritionist tenants) ===');
if (workspaces.length === 0) console.log('  (none yet)');
else workspaces.forEach((r) =>
  console.log(`  "${r.name}" (plan=${r.plan}, status=${r.status}) — owner: ${r.owner_email}`));

console.log('\n=== 👤 CLIENTS ===');
if (clients.length === 0) console.log('  (none yet)');
else clients.forEach((r) => console.log(`  ${r.email}`));

await c.end();
