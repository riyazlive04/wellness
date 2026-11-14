/**
 * Checks for the markdown → import-payload parser.
 *
 * Uses node:test (built in, no dependency):
 *   node --test scripts/parse-video-scripts.test.mjs
 *
 * The parser is the only piece of this feature with real branching, and it is
 * the piece that silently produced nothing when a regex was wrong — an emoji
 * in a character class matched no script at all, and the page just looked
 * empty. These tests exist so that fails loudly instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'parse-video-scripts.mjs');

const payload = JSON.parse(
  execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
);
const scripts = payload.scripts;

/* --- acceptance criterion 3: all 50 import, 10 buckets, in number order --- */

test('parses all 50 scripts', () => {
  assert.equal(scripts.length, 50);
});

test('covers all ten buckets', () => {
  const buckets = [...new Set(scripts.map((s) => s.bucket))].sort((a, b) => a - b);
  assert.deepEqual(buckets, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('numbers are 1..50 with no gaps or duplicates', () => {
  const nums = scripts.map((s) => s.number).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({ length: 50 }, (_, i) => i + 1));
});

test('is sorted by number', () => {
  for (let i = 1; i < scripts.length; i += 1) {
    assert.ok(scripts[i].number > scripts[i - 1].number, `out of order at ${i}`);
  }
});

/* --- the emoji regression: a duration must survive the surrogate pair --- */

test('reads the duration past the emoji', () => {
  for (const s of scripts) {
    assert.ok(
      Number.isInteger(s.duration_seconds) && s.duration_seconds >= 5,
      `script ${s.number} has no duration`,
    );
  }
  assert.deepEqual(
    [...new Set(scripts.map((s) => s.duration_seconds))].sort((a, b) => a - b),
    [30, 60, 100, 120, 150, 180],
  );
});

/* --- every script is actually usable --- */

test('every script has a title, bucket title and at least one line', () => {
  for (const s of scripts) {
    assert.ok(s.title, `script ${s.number}: no title`);
    assert.ok(!s.title.includes('"'), `script ${s.number}: stray quote in title`);
    assert.ok(s.bucket_title, `script ${s.number}: no bucket title`);
    assert.ok(s.lines.length > 0, `script ${s.number}: no lines`);
  }
});

test('every line has a number and on-screen direction', () => {
  for (const s of scripts) {
    for (const l of s.lines) {
      assert.ok(Number.isInteger(l.n), `script ${s.number}: line without n`);
      assert.equal(typeof l.vo, 'string');
      assert.ok(l.on_screen, `script ${s.number} line ${l.n}: no on-screen direction`);
      // The VO must not keep the wrapping quotes the markdown uses.
      assert.ok(!/^"[\s\S]*"$/.test(l.vo), `script ${s.number} line ${l.n}: VO still quoted`);
    }
  }
});

test('captures who each script targets, including bucket 8', () => {
  for (const s of scripts) {
    assert.ok(s.avatar, `script ${s.number}: no avatar/objection captured`);
  }
  // Bucket 8 labels it "Objection:" rather than "Avatar:".
  assert.match(scripts.find((s) => s.number === 36).avatar, /price/i);
});

test('reads the trailing parenthetical as kind, not into the title', () => {
  const close = scripts.find((s) => s.number === 50);
  assert.equal(close.title, 'The Close');
  assert.match(close.kind, /VSL/i);
});

/* --- brand correctness: the shipped product is NUSI, not SIRAH LIFE --- */

test('no script still says SIRAH LIFE or sirahlife.com', () => {
  const blob = JSON.stringify(payload);
  assert.ok(!/SIRAH\s+LIFE/i.test(blob), 'a script still names SIRAH LIFE');
  assert.ok(!/sirahlife\.com/i.test(blob), 'a script still links sirahlife.com');
});

/* --- pricing must match backend/src/billing/plans.ts --- */

test('quoted prices are the real plan prices', () => {
  const blob = JSON.stringify(payload);
  // Spelled-out VO figures, as a voice engine must read them.
  assert.ok(/three thousand nine hundred and ninety-nine/i.test(blob));
  assert.ok(/eight thousand nine hundred and ninety-nine/i.test(blob));
  assert.ok(/nineteen thousand nine hundred and ninety-nine/i.test(blob));
  // Retired figures that were wrong must not come back.
  assert.ok(!/₹3,999 \/ 5k/i.test(blob), 'stale top-up price for 5k credits');
  assert.ok(!/₹9,999 \/ 20k/i.test(blob), 'stale top-up price for 20k credits');
});

test('trial seat counts match TRIAL_LIMITS (50 clients, 5 team)', () => {
  const blob = JSON.stringify(payload);
  assert.ok(
    !/ten clients, two team members/i.test(blob),
    'a script still quotes the old 10-client / 2-team trial',
  );
});
