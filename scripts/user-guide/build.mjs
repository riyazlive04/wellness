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

function coverHtml(parts, totalPages) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>NUSI · Complete user guide</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #17221a; }
  .sheet { width: 210mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden; }
  .hero { position: relative; padding: 18mm 18mm 14mm; color: #fff; background: linear-gradient(135deg,#1a5c2d,#2f8f46 55%,#6db33f); overflow: hidden; }
  .hero::before, .hero::after { content: ''; position: absolute; border-radius: 50%; background: rgba(255,255,255,.08); }
  .hero::before { width: 120mm; height: 120mm; right: -40mm; top: -50mm; }
  .hero::after { width: 70mm; height: 70mm; right: 30mm; bottom: -45mm; }
  .brand { display: flex; align-items: center; gap: 12px; position: relative; }
  .brand img { width: 46px; height: 46px; border-radius: 12px; background: #fff; }
  .brand b { font-size: 20pt; font-weight: 800; letter-spacing: .02em; }
  .eyebrow { margin-top: 16mm; font-size: 9pt; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; opacity: .85; position: relative; }
  h1 { position: relative; font-size: 38pt; line-height: 1.04; margin: 8px 0 10px; letter-spacing: -.025em; }
  .lede { position: relative; font-size: 12.5pt; max-width: 145mm; opacity: .93; line-height: 1.45; }
  .stats { position: relative; display: flex; gap: 10px; margin-top: 10mm; }
  .stats span { padding: 6px 12px; border-radius: 10px; background: rgba(255,255,255,.16); font-weight: 700; font-size: 9.5pt; }
  .toc { flex: 1; padding: 10mm 18mm 0; }
  .toc h2 { font-size: 8.5pt; letter-spacing: .2em; text-transform: uppercase; color: #2f8f46; margin: 0 0 4mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; }
  .row { display: flex; align-items: center; gap: 9px; padding: 6px 0; border-bottom: 1px dashed #dfe6e0; font-size: 10pt; }
  .row .n { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 8.5pt; flex-shrink: 0; }
  .row .t { flex: 1; font-weight: 600; }
  .row .t small { display: block; font-weight: 500; color: #7c8a80; font-size: 7.5pt; letter-spacing: .04em; }
  .row .p { color: #7c8a80; font-weight: 700; font-size: 9pt; }
  .foot { display: flex; justify-content: space-between; padding: 6mm 18mm 9mm; font-size: 8.5pt; color: #7c8a80; }
</style></head><body><div class="sheet">
  <div class="hero">
    <div class="brand"><img src="${logo}" alt=""><b>NUSI</b></div>
    <div class="eyebrow">For nutritionists &amp; practice teams</div>
    <h1>The complete<br>NUSI user guide</h1>
    <div class="lede">Everything you need to run your practice on NUSI, from your first client to billing, with step-by-step instructions for every section.</div>
    <div class="stats"><span>${parts.length} parts</span><span>${totalPages} pages</span><span>Updated ${UPDATED}</span></div>
  </div>
  <div class="toc"><h2>Contents</h2><div class="grid">
    ${parts.map((g) => `<div class="row"><span class="n" style="background:${g.color}">${g.no}</span><span class="t">${esc(g.title)}<small>${esc(g.section)}</small></span><span class="p">${g.page}</span></div>`).join('')}
  </div></div>
  <div class="foot"><span>NUSI by Sirah Digital · nusi.in</span><span>Each part can also be downloaded on its own from Help &amp; guides.</span></div>
</div></body></html>`;
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

// Cover + contents for the complete guide. Page numbers are those of the
// merged PDF that publish.py makes: this cover, then every guide in order.
const pageCount = (file) => (readFileSync(file, 'latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
let at = 2;
const parts = guides.map((g) => {
  const n = pageCount(join(OUT, `${String(g.no).padStart(2, '0')}-${g.slug}.pdf`));
  const row = { ...g, page: at };
  at += n;
  return row;
});
const coverPath = join(OUT, '00-complete-cover.html');
writeFileSync(coverPath, coverHtml(parts, at - 1));
await page.goto(pathToFileURL(coverPath).href, { waitUntil: 'networkidle' });
await page.pdf({ path: coverPath.replace(/\.html$/, '.pdf'), format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
console.log('✓ cover,', at - 1, 'pages in the complete guide');
await browser.close();
writeFileSync(join(OUT, 'guides.json'), JSON.stringify(guides.map(({ no, slug, section, color, title, tagline }) => ({ no, slug, section, color, title, tagline })), null, 2));
