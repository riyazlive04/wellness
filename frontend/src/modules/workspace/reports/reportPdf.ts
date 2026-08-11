import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReportData } from '@/modules/workspace/api/reports';
import { drawBrandedFooters, drawBrandedHeader, drawCoverPage, resolvePdfBrand } from '@/modules/workspace/pdf/pdfBrand';

/**
 * Report PDF generator — renders the REAL numbers the backend assembled
 * (`reportsApi.data`) into a clean, professional A4 PDF. Same design language
 * as the food-library export: Helvetica throughout, hairline rules, generous
 * whitespace, logo top-left, page numbers in the footer.
 *
 * Returns { pageCount, sizeKb } so the caller can record the report in history.
 */
export async function generateReportPdf(data: ReportData): Promise<{ pageCount: number; sizeKb: number; filename: string }> {
  const brand = await resolvePdfBrand();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const ctx: Ctx = {
    doc,
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    margin: 48,
    y: 0,
  };

  const titleMap: Record<ReportData['kind'], string> = {
    client_health: 'Client Health Report',
    client_monthly: 'Client Monthly Summary',
    program_performance: 'Program Performance',
    workspace_digest: 'Workspace Digest',
    billing_gst: 'Billing & GST Report',
  };

  const heading = data.target?.label ?? data.workspaceName;
  const sub = titleMap[data.kind];

  // ── Page 1: branded cover ─────────────────────────────────────────
  drawCoverPage(doc, brand, {
    margin: ctx.margin,
    kind: data.workspaceName,
    title: sub,
    subtitle: data.target?.label,
    meta: [data.periodLabel].filter(Boolean) as string[],
    generatedOn: `Generated ${fmtDate(data.generatedAt)}`,
  });
  doc.addPage();

  ctx.y = drawBrandedHeader(doc, brand, {
    margin: ctx.margin,
    title: heading,
    subtitle: sub,
    meta: data.periodLabel,
    rightMeta: fmtDate(data.generatedAt),
  });

  switch (data.kind) {
    case 'workspace_digest': renderDigest(ctx, data); break;
    case 'program_performance': renderProgram(ctx, data); break;
    case 'client_health': renderClientHealth(ctx, data); break;
    case 'client_monthly': renderClientMonthly(ctx, data); break;
    default: paragraph(ctx, 'This report type is not yet available.'); break;
  }

  drawBrandedFooters(doc, brand, ctx.margin, { coverPage: true });

  const pageCount = doc.getNumberOfPages();
  const blob = doc.output('blob') as Blob;
  const sizeKb = Math.max(1, Math.round(blob.size / 1024));
  const filename = `SIRAH-${slug(sub)}${data.target ? `-${slug(data.target.label)}` : ''}-${todayIso()}.pdf`;
  doc.save(filename);
  return { pageCount, sizeKb, filename };
}

// ── Layout primitives ───────────────────────────────────────────────────

interface Ctx {
  doc: jsPDF;
  pageW: number;
  pageH: number;
  margin: number;
  y: number;
}

function sectionTitle(ctx: Ctx, label: string): void {
  ensureSpace(ctx, 40);
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(9);
  ctx.doc.setTextColor(90);
  ctx.doc.text(label.toUpperCase(), ctx.margin, ctx.y);
  ctx.doc.setFont('helvetica', 'normal');
  ctx.y += 14;
}

function paragraph(ctx: Ctx, text: string): void {
  const width = ctx.pageW - ctx.margin * 2;
  const lines = ctx.doc.splitTextToSize(text, width) as string[];
  ensureSpace(ctx, lines.length * 13 + 6);
  ctx.doc.setFontSize(10);
  ctx.doc.setTextColor(60);
  ctx.doc.text(lines, ctx.margin, ctx.y);
  ctx.y += lines.length * 13 + 6;
}

/** A grid of metric cards (value + label). */
function statGrid(ctx: Ctx, items: Array<{ label: string; value: string }>, cols = 3): void {
  const { doc, margin, pageW } = ctx;
  const gap = 12;
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = 48;
  for (let i = 0; i < items.length; i += cols) {
    ensureSpace(ctx, cardH + gap);
    const rowY = ctx.y;
    const row = items.slice(i, i + cols);
    row.forEach((it, j) => {
      const x = margin + j * (cardW + gap);
      doc.setDrawColor(230);
      doc.setLineWidth(0.4);
      doc.roundedRect(x, rowY, cardW, cardH, 4, 4);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(25);
      doc.text(it.value, x + 12, rowY + 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(130);
      doc.text(it.label.toUpperCase(), x + 12, rowY + 38);
    });
    ctx.y += cardH + gap;
  }
}

/** Two-column key/value list. */
function keyValues(ctx: Ctx, rows: Array<[string, string]>): void {
  const { doc, margin, pageW } = ctx;
  doc.setFontSize(10);
  for (const [k, v] of rows) {
    ensureSpace(ctx, 18);
    doc.setTextColor(120);
    doc.text(k, margin, ctx.y);
    doc.setTextColor(40);
    doc.text(v || '-', pageW - margin, ctx.y, { align: 'right' });
    ctx.y += 16;
  }
  ctx.y += 4;
}

function table(ctx: Ctx, head: string[], body: Array<Array<string | number>>): void {
  ensureSpace(ctx, 60);
  autoTable(ctx.doc, {
    startY: ctx.y,
    margin: { left: ctx.margin, right: ctx.margin, bottom: ctx.margin + 24 },
    head: [head],
    body,
    theme: 'plain',
    headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: 130, cellPadding: { top: 6, right: 6, bottom: 6, left: 0 }, lineWidth: { bottom: 0.4 }, lineColor: 200 },
    bodyStyles: { fontSize: 9, textColor: 45, cellPadding: { top: 6, right: 6, bottom: 6, left: 0 }, lineWidth: { bottom: 0.4 }, lineColor: 235 },
  });
  // autoTable advances on its own internal cursor; read it back.
  const after = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  ctx.y = (after ?? ctx.y) + 18;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y + needed > ctx.pageH - ctx.margin - 24) {
    ctx.doc.addPage();
    ctx.y = ctx.margin + 12;
  }
}

// ── Per-report bodies ────────────────────────────────────────────────────

function renderDigest(ctx: Ctx, data: ReportData): void {
  const d = data.digest;
  if (!d) { paragraph(ctx, 'No data available for this period.'); return; }
  const o = d.overview;

  sectionTitle(ctx, 'Practice at a glance');
  statGrid(ctx, [
    { label: 'Total clients', value: String(o?.total_clients ?? 0) },
    { label: 'Active clients', value: String(o?.active_clients ?? 0) },
    { label: 'New this month', value: String(o?.new_clients_month ?? 0) },
    { label: 'Active (7d)', value: String(o?.active_7d ?? 0) },
    { label: 'Active programs', value: String(o?.active_programs ?? 0) },
    { label: 'Avg progress', value: `${o?.avg_program_progress ?? 0}%` },
    { label: 'AI calls (month)', value: String(o?.ai_calls_month ?? 0) },
    { label: 'Messages (7d)', value: String(o?.messages_7d ?? 0) },
    { label: 'MRR', value: `₹${(o?.mrr_inr ?? 0).toLocaleString('en-IN')}` },
  ]);

  if (d.growth.length) {
    sectionTitle(ctx, 'Client growth (last 6 months)');
    table(ctx, ['Month', 'New clients'], d.growth.map((g) => [g.month, g.count]));
  }

  if (d.engagement.length) {
    const total = d.engagement.reduce((s, e) => s + e.active, 0);
    const avg = Math.round(total / d.engagement.length);
    const peak = d.engagement.reduce((m, e) => Math.max(m, e.active), 0);
    sectionTitle(ctx, 'Engagement (last 30 days)');
    statGrid(ctx, [
      { label: 'Avg daily active', value: String(avg) },
      { label: 'Peak day', value: String(peak) },
      { label: 'Days tracked', value: String(d.engagement.length) },
    ]);
  }

  if (d.programs.by_status.length) {
    sectionTitle(ctx, 'Programs by status');
    table(ctx, ['Status', 'Programs', 'Avg progress'],
      d.programs.by_status.map((p) => [titleCase(p.status), p.count, `${p.avg_progress}%`]));
  }

  if (d.nutrition) {
    sectionTitle(ctx, 'Nutrition (last 30 days, all clients)');
    keyValues(ctx, [
      ['Avg daily calories', `${d.nutrition.avg_daily_kcal} kcal`],
      ['Protein logged', `${d.nutrition.protein_g} g`],
      ['Carbohydrate logged', `${d.nutrition.carb_g} g`],
      ['Fat logged', `${d.nutrition.fat_g} g`],
      ['Meals logged', String(d.nutrition.meal_count)],
    ]);
  }

  if (d.aiUsage.by_service.length) {
    const total = d.aiUsage.daily.reduce((s, x) => s + x.calls, 0);
    sectionTitle(ctx, `AI usage (last 14 days · ${total} calls)`);
    table(ctx, ['Service', 'Calls'], d.aiUsage.by_service.map((s) => [titleCase(s.service), s.calls]));
  }
}

function renderProgram(ctx: Ctx, data: ReportData): void {
  const p = data.program;
  if (!p) { paragraph(ctx, 'Program data unavailable.'); return; }

  sectionTitle(ctx, 'Overview');
  keyValues(ctx, [
    ['Category', titleCase(p.category ?? '-')],
    ['Duration', p.durationWeeks ? `${p.durationWeeks} weeks` : '-'],
    ['Total enrolled', String(p.enrolled)],
  ]);

  sectionTitle(ctx, 'Enrollment funnel');
  statGrid(ctx, [
    { label: 'Enrolled', value: String(p.enrolled) },
    { label: 'Active', value: String(p.active) },
    { label: 'Completed', value: String(p.completed) },
    { label: 'Paused', value: String(p.paused) },
    { label: 'Cancelled', value: String(p.cancelled) },
    { label: 'Avg progress', value: `${p.avgProgress}%` },
  ]);

  sectionTitle(ctx, 'Outcomes');
  statGrid(ctx, [
    { label: 'Completion rate', value: `${p.completionRate}%` },
    { label: 'Dropout rate', value: `${p.dropoutRate}%` },
    { label: 'Avg progress', value: `${p.avgProgress}%` },
  ]);

  if (p.enrolled === 0) {
    paragraph(ctx, 'No clients have been assigned to this program yet. Once you assign clients, this report will show real enrollment, adherence, and completion numbers.');
  }
}

function renderClientHealth(ctx: Ctx, data: ReportData): void {
  const c = data.client;
  if (!c) { paragraph(ctx, 'Client data unavailable.'); return; }

  sectionTitle(ctx, 'Profile');
  keyValues(ctx, [
    ['Email', c.email ?? '-'],
    ['Phone', c.phone ?? '-'],
    ['Age', c.age != null ? String(c.age) : '-'],
    ['Gender', titleCase(c.gender ?? '-')],
    ['Status', titleCase(c.status ?? '-')],
    ['Program type', c.programType ?? '-'],
    ['Goal', c.goals ?? '-'],
    ['Target calories', c.targetKcal ? `${c.targetKcal} kcal` : '-'],
    ['Latest weight', c.lastWeight ? `${c.lastWeight} kg` : '-'],
    ['Client since', c.joinedAt ? fmtDate(c.joinedAt) : '-'],
    ['Last active', c.lastActiveAt ? fmtDate(c.lastActiveAt) : '-'],
  ]);

  sectionTitle(ctx, 'Program');
  if (c.program) {
    keyValues(ctx, [
      ['Program', c.program.name],
      ['Status', titleCase(c.program.status)],
      ['Progress', `${c.program.progressPct}%`],
      ['Started', c.program.startDate ? fmtDate(c.program.startDate) : '-'],
      ['Ends', c.program.endDate ? fmtDate(c.program.endDate) : '-'],
    ]);
  } else {
    paragraph(ctx, 'No program currently assigned.');
  }

  sectionTitle(ctx, 'Nutrition & adherence (last 30 days)');
  statGrid(ctx, [
    { label: 'Avg daily kcal', value: String(c.nutrition30d.avgDailyKcal) },
    { label: 'Meals logged', value: String(c.nutrition30d.mealCount) },
    { label: 'Days active', value: `${c.nutrition30d.daysActive}/30` },
    { label: 'Protein', value: `${c.nutrition30d.proteinG} g` },
    { label: 'Carbs', value: `${c.nutrition30d.carbG} g` },
    { label: 'Fat', value: `${c.nutrition30d.fatG} g` },
  ]);

  sectionTitle(ctx, "Coach's notes");
  paragraph(ctx, '________________________________________________________________________________');
  paragraph(ctx, '________________________________________________________________________________');
}

function renderClientMonthly(ctx: Ctx, data: ReportData): void {
  const c = data.client;
  if (!c) { paragraph(ctx, 'Client data unavailable.'); return; }

  paragraph(ctx, `Hi ${c.name.split(' ')[0]}, here's your wellness recap for ${data.periodLabel}.`);

  sectionTitle(ctx, 'Wins this month');
  statGrid(ctx, [
    { label: 'Days active', value: `${c.nutrition30d.daysActive}/30` },
    { label: 'Meals logged', value: String(c.nutrition30d.mealCount) },
    { label: 'Avg daily kcal', value: String(c.nutrition30d.avgDailyKcal) },
  ]);

  if (c.program) {
    sectionTitle(ctx, 'Program progress');
    keyValues(ctx, [
      ['Program', c.program.name],
      ['Progress', `${c.program.progressPct}%`],
      ['Status', titleCase(c.program.status)],
    ]);
  }

  sectionTitle(ctx, 'Looking ahead');
  const tip = c.nutrition30d.daysActive < 15
    ? 'Aim to log at least one meal a day next month - consistency is what moves the needle.'
    : 'Great consistency! Next month, focus on hitting your protein target to keep momentum.';
  paragraph(ctx, tip);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'report';
}
