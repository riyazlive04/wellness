// =============================================================================
// SIRAH LIFE — client onboarding video recorder (Playwright).
//
// Drives the real client portal and records a clean .webm (auto-converts to
// .mp4 if ffmpeg is installed). Adds a smooth fake cursor, click ripples, and
// on-screen captions so it reads as a guided walkthrough.
//
//   DEMO_EMAIL=demo.client@example.com DEMO_PASSWORD=... npm run record
//
// Config (env):
//   BASE_URL   default http://localhost:4000   (or https://nusi.sirahagents.com)
//   DEMO_EMAIL / DEMO_PASSWORD   a seeded DEMO client account (never real PII)
//   THEME      light | dark      default light
//   WIDTH/HEIGHT   default 1280x720   (use 1920x1080 for full-HD)
//   OUT_DIR    default videos
//   HEADLESS   true | false      default true
//   SLOWMO     ms between actions default 180
// =============================================================================
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { steps, intro, outro } from './steps.mjs';

const cfg = {
  base:     process.env.BASE_URL   || 'http://localhost:4000',
  email:    process.env.DEMO_EMAIL || '',
  password: process.env.DEMO_PASSWORD || '',
  outDir:   process.env.OUT_DIR    || 'videos',
  width:    Number(process.env.WIDTH  || 1280),
  height:   Number(process.env.HEIGHT || 720),
  theme:    process.env.THEME      || 'light',
  headless: process.env.HEADLESS   !== 'false',
  slowMo:   Number(process.env.SLOWMO || 180),
};

if (!cfg.email || !cfg.password) {
  console.error('✗ Set DEMO_EMAIL and DEMO_PASSWORD (a seeded demo CLIENT account). See README.md');
  process.exit(1);
}
mkdirSync(cfg.outDir, { recursive: true });

const browser = await chromium.launch({ headless: cfg.headless, slowMo: cfg.slowMo });
const context = await browser.newContext({
  viewport: { width: cfg.width, height: cfg.height },
  deviceScaleFactor: 2,
  recordVideo: { dir: cfg.outDir, size: { width: cfg.width, height: cfg.height } },
});

// Force the theme before any app JS runs.
await context.addInitScript((t) => { try { localStorage.setItem('sirah-ui-theme', t); } catch { /* */ } }, cfg.theme);

// Fake cursor + click ripple, injected on every navigation (Playwright doesn't
// paint a cursor into the recording).
await context.addInitScript(() => {
  const install = () => {
    if (document.getElementById('__cur')) return;
    const cur = document.createElement('div'); cur.id = '__cur';
    cur.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(20,20,20,.30);border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;left:-60px;top:-60px';
    document.body.appendChild(cur);
    const st = document.createElement('style'); st.textContent = '@keyframes __rp{to{transform:scale(10);opacity:0}}'; document.head.appendChild(st);
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;z-index:2147483646;left:${e.clientX}px;top:${e.clientY}px;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:rgba(14,154,168,.55);pointer-events:none;animation:__rp .5s ease-out forwards`;
      document.body.appendChild(r); setTimeout(() => r.remove(), 520);
    }, true);
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', install) : install();
});

const page = await context.newPage();
const sleep = (ms) => page.waitForTimeout(ms);

async function caption(text, ms = 2800) {
  if (!text) return;
  await page.evaluate((t) => {
    let c = document.getElementById('__cap');
    if (!c) {
      c = document.createElement('div'); c.id = '__cap';
      c.style.cssText = 'position:fixed;left:50%;bottom:46px;transform:translateX(-50%);z-index:2147483647;background:rgba(10,12,16,.9);color:#fff;padding:13px 24px;border-radius:14px;font:600 18px/1.35 system-ui,Segoe UI,Roboto;box-shadow:0 12px 34px rgba(0,0,0,.45);max-width:78vw;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s';
      document.body.appendChild(c);
    }
    c.textContent = t; requestAnimationFrame(() => { c.style.opacity = '1'; });
  }, text).catch(() => {});
  await sleep(ms);
}
const clearCaption = () => page.evaluate(() => { const c = document.getElementById('__cap'); if (c) c.style.opacity = '0'; }).catch(() => {});

async function gentleScroll() {
  await page.evaluate(async () => {
    const el = document.scrollingElement, h = el.scrollHeight, vh = innerHeight;
    if (h <= vh + 40) return;
    const target = Math.min(h - vh, vh * 1.1), start = el.scrollTop, N = 40;
    for (let i = 1; i <= N; i++) { el.scrollTop = start + (target - start) * (i / N); await new Promise((r) => setTimeout(r, 22)); }
    await new Promise((r) => setTimeout(r, 400));
    for (let i = N; i >= 0; i--) { el.scrollTop = target * (i / N); await new Promise((r) => setTimeout(r, 12)); }
  }).catch(() => {});
}

async function go(path) {
  await page.goto(cfg.base + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await sleep(700);
}

async function type(sel, text) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox().catch(() => null);
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await el.click().catch(() => {});
  await el.type(text, { delay: 55 }).catch(() => {});
}

// ---- Run --------------------------------------------------------------------
console.log(`▶ Recording ${cfg.base}  @ ${cfg.width}x${cfg.height}  theme=${cfg.theme}`);

await go('/auth');
await caption(intro, 3200);
await type('input[type="email"]', cfg.email);
await type('input[type="password"]', cfg.password);
await caption('Sign in with the invite from your nutritionist', 1800);
await page.locator('button[type="submit"]').first().click().catch(() => {});
await page.waitForURL('**/portal**', { timeout: 20000 }).catch(() => {});
await sleep(1500);

for (const s of steps) {
  await clearCaption();
  if (s.goto) await go(s.goto);
  await caption(s.caption, s.wait ?? 3200);
  if (s.scroll) await gentleScroll();
}
await caption(outro, 3800);
await clearCaption();

await context.close(); // <-- flushes/saves the .webm
await browser.close();

const webm = readdirSync(cfg.outDir).filter((f) => f.endsWith('.webm')).map((f) => join(cfg.outDir, f)).sort().pop();
console.log(`✓ Saved ${webm}`);

// Auto-convert to MP4 if ffmpeg is on PATH.
try {
  const mp4 = webm.replace(/\.webm$/, '.mp4');
  execSync(`ffmpeg -y -i "${webm}" -vf fps=30 -c:v libx264 -pix_fmt yuv420p -crf 20 "${mp4}"`, { stdio: 'ignore' });
  console.log(`✓ MP4   ${mp4}`);
} catch {
  console.log('  (ffmpeg not found — install it to auto-produce an .mp4; see README.md)');
}
