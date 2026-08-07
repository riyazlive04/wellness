require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, slug, name FROM public.workspaces WHERE slug IS NOT NULL LIMIT 5`,
  );
  console.log(JSON.stringify(rows, null, 2));

  if (rows[0]) {
    const ws = rows[0];
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.workspace_public_profiles (workspace_id, enabled, headline, bio, show_join_cta)
       VALUES ($1::uuid, true, 'Test headline', 'Smoke-test bio', true)
       ON CONFLICT (workspace_id) DO UPDATE
         SET enabled = true, headline = EXCLUDED.headline, bio = EXCLUDED.bio, updated_at = now()`,
      ws.id,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM public.workspace_profile_links WHERE workspace_id = $1::uuid`,
      ws.id,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO public.workspace_profile_links (workspace_id, label, url, sort_order, icon, enabled)
       VALUES ($1::uuid, 'Website', 'https://sirahagents.com', 0, 'website', true)`,
      ws.id,
    );
    console.log('seeded_slug', ws.slug);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
