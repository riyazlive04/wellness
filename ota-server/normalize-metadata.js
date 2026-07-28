'use strict';
/**
 * Rewrite Windows backslash asset paths in an `expo export` metadata.json to
 * forward slashes, so the Linux OTA server can open the files. Runs once at
 * publish time. Usage: node normalize-metadata.js <path/to/metadata.json>
 */
const fs = require('fs');

const p = process.argv[2];
if (!p) {
  console.error('usage: node normalize-metadata.js <metadata.json>');
  process.exit(1);
}

const toSlash = (s) => s.replace(/\\/g, '/');
const m = JSON.parse(fs.readFileSync(p, 'utf8'));

for (const platform of Object.keys(m.fileMetadata || {})) {
  const fm = m.fileMetadata[platform];
  if (fm.bundle) fm.bundle = toSlash(fm.bundle);
  for (const a of fm.assets || []) if (a.path) a.path = toSlash(a.path);
}

fs.writeFileSync(p, JSON.stringify(m));
console.log('normalized', p);
