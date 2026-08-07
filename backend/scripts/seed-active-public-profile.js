require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  const rows = await p.$queryRawUnsafe(
    `SELECT id, slug, status FROM public.workspaces WHERE status = 'active' AND slug IS NOT NULL LIMIT 5`,
  );
  console.log(JSON.stringify(rows, null, 2));
  if (rows[0]) {
    await p.$executeRawUnsafe(
      `INSERT INTO public.workspace_public_profiles (workspace_id, enabled, headline, bio, show_join_cta)
       VALUES ($1::uuid, true, 'Clinical nutrition', 'Welcome', true)
       ON CONFLICT (workspace_id) DO UPDATE SET enabled = true, updated_at = now()`,
      rows[0].id,
    );
    console.log('seeded', rows[0].slug);
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
