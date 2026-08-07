require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRawUnsafe(`
    SELECT w.slug, w.status, p.enabled, p.headline
      FROM public.workspaces w
      LEFT JOIN public.workspace_public_profiles p ON p.workspace_id = w.id
     WHERE w.slug = 'meera-nutrition-studio'`);
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
