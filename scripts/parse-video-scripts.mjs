#!/usr/bin/env node
/**
 * Parse films/sirah-life/SCRIPTS_*.md into the payload for
 * POST /api/v1/admin/video-scripts/import.
 *
 * One-off seeder. After the import the database is the source of truth and
 * these markdown files are only the origin — re-running is safe (the endpoint
 * upserts on `number`) but will overwrite edits made in the admin UI.
 *
 *   node scripts/parse-video-scripts.mjs            # write payload to stdout
 *   node scripts/parse-video-scripts.mjs -o out.json
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'films', 'sirah-life');

/** "# BUCKET 1 — The Tool Stack Bleed" */
const BUCKET_RE = /^#\s+BUCKET\s+(\d+)\s+—\s+(.+?)\s*$/i;
/**
 * '## Script 01 🔴 30s — "Six Tabs"' with an optional trailing "(VSL)".
 * The duration emoji is matched as \S+ — never a character class, because a
 * class splits a 4-byte emoji into broken surrogate halves and matches nothing.
 */
const HEAD_RE = /^##\s+Script\s+(\d+)\s+(?:\S+\s+)?(\d+)s\s+—\s+(.+?)\s*$/;
/** "**Avatar:** Solo nutritionist…" */
const META_RE = /^\*\*(.+?):\*\*\s*(.+?)\s*$/;

/** Split a markdown table row into trimmed cells. */
function cells(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Strip the surrounding quotes a VO line carries, but keep inner ones. */
function unquote(s) {
  const m = s.match(/^"([\s\S]*)"$/);
  return (m ? m[1] : s).trim();
}

function parseFile(md) {
  const out = [];
  let bucket = 0;
  let bucketTitle = '';
  let cur = null;

  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };

  for (const raw of md.split('\n')) {
    const line = raw.replace(/\r$/, '');

    const b = line.match(BUCKET_RE);
    if (b) {
      flush();
      bucket = Number(b[1]);
      bucketTitle = b[2];
      continue;
    }

    const h = line.match(HEAD_RE);
    if (h) {
      flush();
      // Title is quoted, sometimes followed by a parenthetical kind.
      const tm = h[3].match(/^"([^"]+)"\s*(?:\((.+)\))?\s*$/);
      cur = {
        number: Number(h[1]),
        duration_seconds: Number(h[2]),
        title: tm ? tm[1] : h[3].replace(/"/g, '').trim(),
        kind: tm && tm[2] ? tm[2] : undefined,
        bucket,
        bucket_title: bucketTitle,
        status: 'draft',
        lines: [],
      };
      continue;
    }

    if (!cur) continue;

    const m = line.match(META_RE);
    if (m) {
      const key = m[1].toLowerCase();
      // Bucket 8 labels its target as "Objection" rather than "Avatar" —
      // same field, different word for who the script is aimed at.
      if (key === 'avatar' || key === 'objection') cur.avatar = m[2];
      else if (key === 'hook type') cur.hook_type = m[2];
      continue;
    }

    // Table body rows only: | 1 | "VO" | On screen |
    if (line.startsWith('|')) {
      const c = cells(line);
      if (c.length < 3) continue;
      if (!/^\d+$/.test(c[0])) continue; // skips header and --- separator
      cur.lines.push({
        n: Number(c[0]),
        vo: unquote(c[1]),
        on_screen: c[2],
      });
    }
  }

  flush();
  return out;
}

const files = readdirSync(DIR)
  .filter((f) => /^SCRIPTS_[\d-]+\.md$/.test(f))
  .sort();

const scripts = files.flatMap((f) => parseFile(readFileSync(join(DIR, f), 'utf8')));
scripts.sort((a, b) => a.number - b.number);

// Fail loudly rather than importing a half-parsed library.
const problems = [];
const seen = new Set();
for (const s of scripts) {
  if (seen.has(s.number)) problems.push(`duplicate number ${s.number}`);
  seen.add(s.number);
  if (!s.title) problems.push(`script ${s.number}: no title`);
  if (!s.lines.length) problems.push(`script ${s.number}: no lines`);
  if (!s.bucket) problems.push(`script ${s.number}: no bucket`);
}
if (problems.length) {
  console.error('Parse problems:\n  ' + problems.join('\n  '));
  process.exit(1);
}

const payload = { scripts };
const outFlag = process.argv.indexOf('-o');
if (outFlag !== -1 && process.argv[outFlag + 1]) {
  writeFileSync(process.argv[outFlag + 1], JSON.stringify(payload, null, 2));
  console.error(
    `${scripts.length} scripts, ${new Set(scripts.map((s) => s.bucket)).size} buckets ` +
      `→ ${process.argv[outFlag + 1]}`,
  );
} else {
  process.stdout.write(JSON.stringify(payload, null, 2));
}
