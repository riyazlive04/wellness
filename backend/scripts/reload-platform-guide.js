/**
 * Reload the built-in NUSI guide (docs/nutritionist-knowledge-base.md) that
 * Ask NUSI answers from, after editing it.
 *
 * Run from backend/ after a build:
 *   node scripts/reload-platform-guide.js [path/to/guide.md]           # dry run
 *   node scripts/reload-platform-guide.js [path/to/guide.md] --apply   # write
 *
 * Indexes the new version first and only then deletes the old one, so Ask
 * NUSI is never without a guide. Uses the app's own chunking and ingestion.
 * Restart the backend afterwards so its cached guide vocabulary refreshes.
 */
const fs = require('fs');
const path = require('path');

for (const file of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');
const { KnowledgeService } = require('../dist/knowledge/knowledge.service');
const { chunkDocument } = require('../dist/knowledge/chunker');

const TITLE = 'NUSI Nutritionist Guide';
const SOURCE = 'nutritionist-knowledge-base.md';
const APPLY = process.argv.includes('--apply');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
  || path.join(__dirname, '..', '..', 'docs', SOURCE);

async function main() {
  const text = fs.readFileSync(file, 'utf8');
  const db = new PrismaClient();
  const old = await db.$queryRawUnsafe(
    `SELECT id, chunk_count FROM public.kb_documents WHERE scope = 'platform' AND title = $1`, TITLE);
  console.log(`guide file: ${file} (${chunkDocument(TITLE, text).length} sections)`);
  console.log(`current platform copies: ${old.length}`, old.map((d) => `${d.chunk_count} sections`));

  if (!APPLY) {
    console.log('DRY RUN - pass --apply to replace it.');
    await db.$disconnect();
    return;
  }

  // ingestText only touches the database; the other collaborators are unused.
  const kb = new KnowledgeService(db, {}, {}, {});
  const doc = await kb.ingestText({
    scope: 'platform', workspaceId: null, title: TITLE, text, sourceName: SOURCE, mimeType: 'text/markdown',
  });
  console.log(`indexed new guide: ${doc.chunk_count} sections, status ${doc.status}`);
  if (doc.status !== 'ready') throw new Error('New guide did not index; old one left in place.');

  for (const d of old) {
    await db.$executeRawUnsafe('DELETE FROM public.kb_documents WHERE id = $1::uuid', d.id);
  }
  console.log(`removed ${old.length} old cop${old.length === 1 ? 'y' : 'ies'}`);
  await db.$disconnect();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
