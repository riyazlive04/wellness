/**
 * Regenerate src/i18n/resources.{en,ta}.ts from the JSON in src/i18n/locales/.
 *
 *   node scripts/gen-i18n-resources.mjs
 *
 * Metro cannot glob a directory at runtime, so each namespace has to be
 * imported by name. Writing those lists by hand is how a namespace silently
 * goes missing from one language, so they are generated instead.
 *
 * The JSON itself is copied from the web portal
 * (frontend/src/i18n/locales/{en,ta}/client*.json + common.json) so both
 * surfaces use the same wording.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', 'src', 'i18n');

/** `meal-plan` -> `mealPlan`, so the import is a valid identifier. */
const ident = (name) =>
  name.split('-').map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join('');

for (const loc of ['en', 'ta']) {
  const dir = path.join(root, 'locales', loc);
  const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();

  const out = [
    '/**',
    ` * ${loc} resource bundle, generated from src/i18n/locales/${loc}/.`,
    ' *',
    ' * Metro cannot glob a directory at runtime, so every namespace is imported',
    ' * explicitly. Regenerate with scripts/gen-i18n-resources.mjs after adding a',
    ' * namespace - do not hand-edit.',
    ' */',
    ...names.map((n) => `import ${ident(n)} from './locales/${loc}/${n}.json';`),
    '',
    'export default {',
    ...names.map((n) => `  '${n}': ${ident(n)},`),
    '} as const;',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(root, `resources.${loc}.ts`), out, 'utf8');
  console.log(`resources.${loc}.ts -> ${names.length} namespaces`);
}

// A namespace present in one language and not the other renders as raw keys
// for whoever is missing it, so say so loudly rather than shipping it.
const list = (loc) =>
  new Set(fs.readdirSync(path.join(root, 'locales', loc)).filter((f) => f.endsWith('.json')));
const en = list('en');
const ta = list('ta');
const onlyEn = [...en].filter((f) => !ta.has(f));
const onlyTa = [...ta].filter((f) => !en.has(f));
if (onlyEn.length || onlyTa.length) {
  console.error('MISMATCH — en only:', onlyEn, '| ta only:', onlyTa);
  process.exitCode = 1;
}
