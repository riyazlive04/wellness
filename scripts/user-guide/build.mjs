// =============================================================================
// NUSI user guide — builds one branded A4 PDF per section from guides/*.mjs.
//
//   node build.mjs                 → all guides into OUT_DIR (default ./out)
//   node build.mjs clients billing → only those
//   python publish.py              → compress, merge, copy into the app
//                                    (frontend/public/guides, shown in Help & guides)
//
// Each guide module exports `default` = {
//   no, slug, title, tagline, where, intro,
//   sections: [{ title, text?, steps?, bullets?, tip?, note?, table? }]
// }
// Text supports **bold** and `Button label` (shown as a UI label chip).
// =============================================================================
import { chromium } from '../onboarding-video/node_modules/playwright/index.mjs';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || join(here, 'out');
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const logo = 'data:image/png;base64,' + readFileSync(join(here, 'logo.png')).toString('base64');
const UPDATED = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`(.+?)`/g, '<span class="ui">$1</span>');

function sectionHtml(sec, i) {
  const parts = [`<section><h2><span class="num">${i + 1}</span>${fmt(sec.title)}</h2>`];
  for (const p of [].concat(sec.text ?? [])) parts.push(`<p>${fmt(p)}</p>`);
  if (sec.steps) parts.push(`<ol class="steps">${sec.steps.map((s) => `<li>${fmt(s)}</li>`).join('')}</ol>`);
  if (sec.bullets) parts.push(`<ul class="bullets">${sec.bullets.map((s) => `<li>${fmt(s)}</li>`).join('')}</ul>`);
  if (sec.table) {
    const [head, ...rows] = sec.table;
    parts.push(`<table><thead><tr>${head.map((h) => `<th>${fmt(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${fmt(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
  }
  for (const t of [].concat(sec.tip ?? [])) parts.push(`<div class="box tip"><b>Tip</b>${fmt(t)}</div>`);
  for (const n of [].concat(sec.note ?? [])) parts.push(`<div class="box note"><b>Good to know</b>${fmt(n)}</div>`);
  parts.push('</section>');
  return parts.join('\n');
}

function guideHtml(g, total) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>NUSI · ${esc(g.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #17221a; font-size: 10pt; line-height: 1.42; margin: 0; }
  .head { border-radius: 14px; background: linear-gradient(135deg,#1f6b34,#2f8f46 60%,#5aa83f); color: #fff; padding: 14px 18px 16px; margin-bottom: 5mm; }
  .head .brand { display: flex; align-items: center; gap: 10px; }
  .head .brand img { width: 30px; height: 30px; border-radius: 8px; background: #fff; }
  .head .brand div { font-weight: 800; font-size: 12pt; letter-spacing: .02em; }
  .head .brand span { margin-left: auto; font-size: 7.5pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; opacity: .85; }
  .head h1 { font-size: 24pt; line-height: 1.1; margin: 10px 0 4px; letter-spacing: -.02em; }
  .head .tagline { font-size: 10.5pt; opacity: .92; }
  .head .where { display: inline-block; margin-top: 9px; padding: 4px 10px; border-radius: 8px; background: rgba(255,255,255,.16); font-weight: 600; font-size: 8.5pt; }
  .head .where .ui { background: #fff; color: #1f3b27; border-color: #fff; }
  .lead { display: flex; gap: 6mm; margin-bottom: 5mm; align-items: flex-start; }
  .lead > div { flex: 1; }
  .lead h3 { font-size: 7.5pt; letter-spacing: .18em; text-transform: uppercase; color: #2f8f46; margin: 0 0 4px; }
  .intro { padding: 9px 12px; border-radius: 10px; background: #f4f8f5; }
  .intro p { margin: 0 0 4px; } .intro p:last-child { margin: 0; }
  .toc ol { margin: 0; padding: 0; list-style: none; counter-reset: t; }
  .toc li { counter-increment: t; display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px dashed #dfe6e0; font-size: 9pt; }
  .toc li::before { content: counter(t); width: 14px; font-weight: 800; color: #2f8f46; }
  .meta { font-size: 7.5pt; color: #7c8a80; margin-top: 6px; }
  section { margin-bottom: 4.5mm; }
  h2 { font-size: 13pt; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; break-after: avoid; letter-spacing: -.01em; }
  h2 .num { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: #2f8f46; color: #fff; font-size: 9.5pt; flex-shrink: 0; }
  p { margin: 2px 0 5px; }
  ol.steps { list-style: none; padding: 0; margin: 3px 0 5px; counter-reset: s; }
  ol.steps li { counter-increment: s; position: relative; padding: 2px 0 2px 28px; break-inside: avoid; }
  ol.steps li::before { content: counter(s); position: absolute; left: 0; top: 2px; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid #2f8f46; color: #2f8f46; font-weight: 800; font-size: 8pt; display: grid; place-items: center; }
  ul.bullets { margin: 2px 0 5px 16px; padding: 0; }
  ul.bullets li { margin: 1.5px 0; }
  .ui { display: inline-block; padding: 0 5px; line-height: 1.35; border-radius: 5px; background: #eef3ef; border: 1px solid #d9e3db; font-weight: 600; font-size: 8.8pt; color: #1f3b27; white-space: nowrap; }
  .box { margin: 5px 0; padding: 6px 10px 7px 12px; border-radius: 8px; break-inside: avoid; font-size: 9.3pt; }
  .box b:first-child { display: block; font-size: 7.5pt; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 1px; }
  .tip { background: #effaf1; border-left: 4px solid #2f8f46; }
  .tip b:first-child { color: #23733a; }
  .note { background: #fff7e8; border-left: 4px solid #f59e0b; }
  .note b:first-child { color: #b45309; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 6px; font-size: 9pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { text-align: left; background: #f1f5f2; font-weight: 700; padding: 4px 8px; border-bottom: 2px solid #dfe6e0; }
  td { padding: 3.5px 8px; border-bottom: 1px solid #e8ede9; vertical-align: top; }
</style></head><body>
<div class="head">
  <div class="brand"><img src="${logo}" alt=""><div>NUSI</div><span>User guide · Part ${g.no} of ${total}</span></div>
  <h1>${esc(g.title)}</h1>
  <div class="tagline">${fmt(g.tagline)}</div>
  ${g.where ? `<div class="where">Where to find it: ${fmt(g.where)}</div>` : ''}
</div>
<div class="lead">
  ${g.intro ? `<div class="intro"><h3>In short</h3>${[].concat(g.intro).map((p) => `<p>${fmt(p)}</p>`).join('')}</div>` : ''}
  <div class="toc"><h3>In this guide</h3><ol>${g.sections.map((s) => `<li>${fmt(s.title)}</li>`).join('')}</ol><div class="meta">Updated ${UPDATED} · nusi.in</div></div>
</div>
${g.sections.map(sectionHtml).join('\n')}
</body></html>`;
}

const files = readdirSync(join(here, 'guides')).filter((f) => f.endsWith('.mjs')).sort();
const guides = [];
for (const f of files) guides.push((await import(pathToFileURL(join(here, 'guides', f)).href)).default);
guides.sort((a, b) => a.no - b.no);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const g of guides) {
  if (only.length && !only.includes(g.slug)) continue;
  const html = guideHtml(g, guides.length);
  const htmlPath = join(OUT, `${String(g.no).padStart(2, '0')}-${g.slug}.html`);
  writeFileSync(htmlPath, html);
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  const pdfPath = htmlPath.replace(/\.html$/, '.pdf');
  await page.pdf({
    path: pdfPath, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#8a978e;padding:0 15mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>NUSI user guide · ${esc(g.title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '13mm', bottom: '15mm', left: '15mm', right: '15mm' },
  });
  console.log('✓', pdfPath);
}
await browser.close();
writeFileSync(join(OUT, 'guides.json'), JSON.stringify(guides.map(({ no, slug, title, tagline }) => ({ no, slug, title, tagline })), null, 2));
