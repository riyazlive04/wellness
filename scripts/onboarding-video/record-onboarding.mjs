// =============================================================================
// SIRAH LIFE — NEW-NUTRITIONIST onboarding video (signup → create-workspace
// wizard → fresh dashboard). High quality: 1920x1080 @ deviceScaleFactor 2.
//
//   BASE_URL=http://localhost:4000 npm run record:onboarding
//
// Each run creates a REAL new account + workspace in whatever Supabase the app
// points at (junk data — delete the test workspaces afterwards, or point at a
// throwaway Supabase project). Requires email-confirmation to be OFF on the
// Supabase project (else signup can't reach /onboarding headlessly).
// =============================================================================
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const cfg = {
  base:   process.env.BASE_URL || 'http://localhost:4000',
  outDir: process.env.OUT_DIR  || 'videos',
  width:  Number(process.env.WIDTH  || 1920),
  height: Number(process.env.HEIGHT || 1080),
  dsf:    Number(process.env.DSF || 2),
  theme:  process.env.THEME    || 'light',
  headless: process.env.HEADLESS !== 'false',
  slowMo: Number(process.env.SLOWMO || 200),
};

// Unique demo identity per run.
const stamp = Date.now();
const demo = {
  name:     'Dr. Meera Nair',
  email:    process.env.DEMO_EMAIL || `nutritionist.demo.${stamp}@example.com`,
  phone:    '+91 98 76 54 32 10',
  password: process.env.DEMO_PASSWORD || `Demo!${stamp}`,
  practice: process.env.PRACTICE || `Meera Nutrition Studio ${String(stamp).slice(-4)}`,
};

mkdirSync(cfg.outDir, { recursive: true });

const browser = await chromium.launch({ headless: cfg.headless, slowMo: cfg.slowMo });
const context = await browser.newContext({
  viewport: { width: cfg.width, height: cfg.height },
  deviceScaleFactor: cfg.dsf,
  recordVideo: { dir: cfg.outDir, size: { width: cfg.width, height: cfg.height } },
});
await context.addInitScript((t) => { try { localStorage.setItem('sirah-ui-theme', t); } catch { /* */ } }, cfg.theme);
await context.addInitScript(() => {
  const install = () => {
    if (document.getElementById('__cur')) return;
    const cur = document.createElement('div'); cur.id = '__cur';
    cur.style.cssText = 'position:fixed;z-index:2147483647;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:rgba(20,20,20,.28);border:2px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.35);pointer-events:none;left:-80px;top:-80px';
    document.body.appendChild(cur);
    const st = document.createElement('style'); st.textContent = '@keyframes __rp{to{transform:scale(11);opacity:0}}'; document.head.appendChild(st);
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.style.cssText = `position:fixed;z-index:2147483646;left:${e.clientX}px;top:${e.clientY}px;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:rgba(14,154,168,.55);pointer-events:none;animation:__rp .55s ease-out forwards`; document.body.appendChild(r); setTimeout(() => r.remove(), 560); }, true);
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', install) : install();
});

const page = await context.newPage();
page.setDefaultTimeout(6000); // fail fast so a bad selector doesn't stall for minutes
const sleep = (ms) => page.waitForTimeout(ms);

// Debug screenshots (only when DEBUG=1) so we can see each step's real UI.
let shotN = 0;
mkdirSync('debug', { recursive: true });
const shot = async (name) => { if (process.env.DEBUG) await page.screenshot({ path: `debug/${String(++shotN).padStart(2, '0')}-${name}.png` }).catch(() => {}); };

// Diagnostics (DEBUG): surface browser console errors + failing API calls.
if (process.env.DEBUG) {
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser]', m.text().slice(0, 200)); });
  page.on('requestfailed', (r) => console.log('  [reqfail]', r.method(), r.url().split('?')[0], r.failure()?.errorText));
  page.on('response', (r) => { if (r.status() >= 400 && /\/api\/v1\/(workspaces|auth)/.test(r.url())) console.log('  [http]', r.status(), r.request().method(), r.url().split('?')[0]); });
}

async function caption(text, ms = 2800) {
  if (!text) return;
  await page.evaluate((t) => {
    let c = document.getElementById('__cap');
    if (!c) { c = document.createElement('div'); c.id = '__cap';
      c.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);z-index:2147483647;background:rgba(10,12,16,.9);color:#fff;padding:15px 28px;border-radius:16px;font:600 22px/1.35 system-ui,Segoe UI,Roboto;box-shadow:0 14px 40px rgba(0,0,0,.45);max-width:76vw;text-align:center;pointer-events:none;opacity:0;transition:opacity .28s';
      document.body.appendChild(c); }
    c.textContent = t; requestAnimationFrame(() => { c.style.opacity = '1'; });
  }, text).catch(() => {});
  await sleep(ms);
}
const clearCap = () => page.evaluate(() => { const c = document.getElementById('__cap'); if (c) c.style.opacity = '0'; }).catch(() => {});

async function smoothClick(locator, label = '') {
  const el = locator.first();
  const ok = await el.waitFor({ state: 'visible' }).then(() => true).catch(() => false);
  if (!ok) { console.log(`  ⚠ not found: "${label}"`); return; }
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox().catch(() => null);
  if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 26 }); await sleep(300); }
  await el.click().catch((e) => console.log(`  ⚠ click "${label}" failed: ${e.message.split('\n')[0]}`));
  await sleep(650);
}
async function smoothType(locator, text) {
  const el = locator.first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox().catch(() => null);
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await el.click().catch(() => {});
  await el.type(text, { delay: 45 }).catch(() => {});
  await sleep(250);
}
async function gentleScroll() {
  await page.evaluate(async () => {
    const el = document.scrollingElement, h = el.scrollHeight, vh = innerHeight;
    if (h <= vh + 40) return;
    const target = Math.min(h - vh, vh * 1.1), start = el.scrollTop, N = 44;
    for (let i = 1; i <= N; i++) { el.scrollTop = start + (target - start) * (i / N); await new Promise((r) => setTimeout(r, 24)); }
    await new Promise((r) => setTimeout(r, 500));
    for (let i = N; i >= 0; i--) { el.scrollTop = target * (i / N); await new Promise((r) => setTimeout(r, 12)); }
  }).catch(() => {});
}

// ---- Flow -------------------------------------------------------------------
console.log(`▶ Onboarding video ${cfg.base} @ ${cfg.width}x${cfg.height}x${cfg.dsf}  as ${demo.email}`);

await page.goto(`${cfg.base}/auth`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await sleep(1500);
await shot('auth');
await caption('Getting started on SIRAH LIFE', 2800);

console.log('• signup');
await smoothClick(page.getByRole('button', { name: /^Create workspace$/ }), 'Create workspace tab');
await caption("Let's set up your practice", 1600);
await smoothType(page.locator('input[name="name"]'),     demo.name);
await smoothType(page.locator('input[name="email"]'),    demo.email);
await smoothType(page.locator('input[name="phone"]'),    demo.phone);
await smoothType(page.locator('input[name="password"]'), demo.password);
await shot('signup-filled');
await smoothClick(page.locator('button[type="submit"]'), 'Create workspace submit');
// The app navigates to /onboarding immediately after signup. Catch that window
// FAST — a delay here lets the new user get auto-defaulted to 'client' and
// bounced to /portal. So: no extra sleeps/reloads before we're on the wizard.
const onWizard = await page.waitForURL('**/onboarding**', { timeout: 15000 }).then(() => true).catch(() => false);
console.log('  url after submit:', page.url());
await shot('after-submit');
if (!onWizard) {
  console.log(`✗ Not on /onboarding (now ${page.url()}) — routing raced. Re-run; the window is brief.`);
  await context.close(); await browser.close(); process.exit(2);
}
// Wait for the plan catalog to render before selecting (backend now allows the
// catalog for pre-workspace onboarding users).
await sleep(1800);
await page.getByRole('button', { name: /^choose /i }).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
await sleep(800);
await shot('wizard-step1-plan');

console.log('• step 1: plan');
await caption('Pick a plan — 14-day free trial, no card needed', 3000);
await smoothClick(page.getByRole('button', { name: /Growth/ }), 'Growth plan card');
await smoothClick(page.getByRole('button', { name: /start free trial/i }), 'Start free trial');
await sleep(900);
await shot('step2-workspace');

console.log('• step 2: workspace');
await caption('Name your practice — it brands invoices and the client app', 3200);
await smoothType(page.getByPlaceholder('e.g. Sharma Nutrition Clinic'), demo.practice);
await smoothClick(page.getByRole('button', { name: 'Weight Loss', exact: true }), 'spec: Weight Loss');
await smoothClick(page.getByRole('button', { name: 'Sports Nutrition', exact: true }), 'spec: Sports Nutrition');
await smoothClick(page.getByRole('button', { name: /^continue$/i }), 'Continue (workspace)');
await sleep(900);
await shot('step3-kyc');

console.log('• step 3: tax & documents');
await caption('Verify with a document — Aadhaar, PAN or driving licence', 3000);
await smoothType(page.getByPlaceholder('ABCDE1234F'), 'ABCDE1234F');
await page.locator('#doc-upload').setInputFiles('../../frontend/public/icon-192.png').catch((e) => console.log('  ⚠ upload:', e.message.split('\n')[0]));
await sleep(1100);
await caption('Upload your document — verified after signup', 3000);
await smoothType(page.getByPlaceholder('Bengaluru'), 'Bengaluru');
await smoothClick(page.getByLabel('State'), 'State select');
await smoothClick(page.getByRole('option', { name: 'Karnataka' }), 'State: Karnataka');
await smoothType(page.getByPlaceholder('560001'), '560001');
await sleep(400);
await shot('step3-tax-filled');
await caption("That's it — finish and land on your dashboard", 2600);
await smoothClick(page.getByRole('button', { name: /finish onboarding/i }), 'Finish onboarding');

console.log('• waiting for dashboard');
await page.waitForURL('**/dashboard**', { timeout: 20000 }).catch(() => {});
await sleep(2500);
await shot('dashboard');
console.log('  final url:', page.url());
await caption('Your dashboard is ready — welcome to SIRAH LIFE 🎉', 4000);
await gentleScroll();
await clearCap();

await context.close();
await browser.close();

const webm = readdirSync(cfg.outDir).filter((f) => f.endsWith('.webm')).map((f) => join(cfg.outDir, f)).sort().pop();
console.log(`✓ Saved ${webm}`);
try {
  const mp4 = webm.replace(/\.webm$/, '.mp4');
  execSync(`ffmpeg -y -i "${webm}" -vf "fps=30,scale=${cfg.width}:${cfg.height}:flags=lanczos" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p "${mp4}"`, { stdio: 'ignore' });
  console.log(`✓ MP4   ${mp4}  (high quality)`);
} catch {
  console.log('  (ffmpeg not found — install it for a high-quality .mp4; the .webm is ready to view)');
}
