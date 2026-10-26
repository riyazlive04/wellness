/**
 * Prove the Tamil strings really reached a built bundle.
 *
 *   node scripts/check-i18n-bundle.mjs <bundle file>
 *
 * Written as a script rather than a one-liner because searching a bundle for
 * non-ASCII is deceptively easy to get wrong: Metro escapes Tamil as \uXXXX,
 * so grepping for the UTF-8 bytes reports MISSING on a bundle that contains
 * every string. This decodes the escapes first, then searches, and checks an
 * English control so an all-MISSING result cannot be mistaken for a working
 * test.
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/check-i18n-bundle.mjs <bundle>');
  process.exit(2);
}

const raw = fs.readFileSync(file);
const text = raw.toString('utf8');
const decoded = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
  String.fromCharCode(parseInt(h, 16)),
);

// Hermes keeps non-ASCII strings in its table as UTF-16, so a bundle that
// contains every Tamil string shows nothing to a UTF-8 search. Checking both
// encodings is what makes this test trustworthy rather than reassuring.
const utf16 = (s) => Buffer.from(s, 'utf16le');

const probes = [
  ['Tamil · good morning', 'காலை வணக்கம்'],
  ['Tamil · water', 'தண்ணீர்'],
  ['Tamil · quick actions', 'விரைவு செயல்கள்'],
  ['Tamil · language label', 'தமிழ்'],
  ['English control', 'Good morning'],
];

let missing = 0;
for (const [label, needle] of probes) {
  const hit =
    decoded.includes(needle) || raw.includes(needle) || raw.includes(utf16(needle));
  if (!hit) missing += 1;
  console.log(`  ${label.padEnd(24)} ${hit ? 'PRESENT' : 'MISSING'}`);
}

// Count in whichever encoding this bundle actually uses.
const asUtf16 = raw.toString('utf16le');
const runs = [
  ...(decoded.match(/[஀-௿]{3,}/g) ?? []),
  ...(asUtf16.match(/[஀-௿]{3,}/g) ?? []),
];
console.log(`  ${'distinct Tamil strings'.padEnd(24)} ${new Set(runs).size}`);

if (missing) {
  console.error(`\n${missing} probe(s) missing — Tamil did not ship.`);
  process.exitCode = 1;
}
