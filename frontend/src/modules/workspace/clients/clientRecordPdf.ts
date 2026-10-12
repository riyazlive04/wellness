import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { clientsApi, type AssessmentCard } from '@/modules/workspace/api/clients';
import { mealPlansApi, slotLabel, type MealPlan } from '@/modules/workspace/api/mealPlans';
import { drawBrandedFooters, drawBrandedHeader, drawCoverPage, resolvePdfBrand, type PdfBrand } from '@/modules/workspace/pdf/pdfBrand';

/**
 * A client's complete record as a PDF: everything NUSI holds about them, in
 * one readable, printable document the practice can keep as its own backup
 * (profile, goals, weight & habits, measurements, assessments with every
 * answer, meal plans, meal log, cycle, appointments, notes, chat, files).
 *
 * Built in the browser from the same endpoints the client page uses, so it
 * shows exactly what the practice can see. Each part is fetched on its own;
 * one that fails is noted in the PDF rather than losing the whole record.
 */

export interface RecordClient {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  program?: string | null;
  joinedAt?: string | null;
}

type Settled<T> = { ok: true; value: T } | { ok: false };

interface ClientRecord {
  client: RecordClient;
  profile: Settled<Awaited<ReturnType<typeof clientsApi.clientWorkspaceProfile>>>;
  goals: Settled<Awaited<ReturnType<typeof clientsApi.clientWorkspaceGoals>>>;
  habits: Settled<Awaited<ReturnType<typeof clientsApi.clientWorkspaceHabits>>>;
  measurements: Settled<Awaited<ReturnType<typeof clientsApi.clientWorkspaceMeasurements>>>;
  assessments: Settled<AssessmentCard[]>;
  plans: Settled<MealPlan[]>;
  meals: Settled<Awaited<ReturnType<typeof clientsApi.clientWorkspaceMeals>>>;
  cycle: Settled<Awaited<ReturnType<typeof clientsApi.clientWorkspaceCycle>>>;
  appointments: Settled<Awaited<ReturnType<typeof clientsApi.listWorkspaceAppointments>>>;
  notes: Settled<Awaited<ReturnType<typeof clientsApi.clientNotes>>>;
  messages: Settled<Awaited<ReturnType<typeof clientsApi.clientThread>>>;
  files: Settled<Awaited<ReturnType<typeof clientsApi.clientWorkspaceFiles>>>;
}

const settle = <T,>(p: Promise<T>): Promise<Settled<T>> =>
  p.then((value) => ({ ok: true as const, value }), () => ({ ok: false as const }));

/** Fetch everything about one client. A year of daily data; all of the rest. */
export async function gatherClientRecord(client: RecordClient): Promise<ClientRecord> {
  const id = client.id;
  const [profile, goals, habits, measurements, assessments, plans, meals, cycle, appointments, notes, messages, files] = await Promise.all([
    settle(clientsApi.clientWorkspaceProfile(id)),
    settle(clientsApi.clientWorkspaceGoals(id)),
    settle(clientsApi.clientWorkspaceHabits(id, 365)),
    settle(clientsApi.clientWorkspaceMeasurements(id)),
    settle(clientsApi.clientAssessments(id)),
    settle(loadPlans(id)),
    settle(clientsApi.clientWorkspaceMeals(id, 365)),
    settle(clientsApi.clientWorkspaceCycle(id, 730)),
    settle(clientsApi.listWorkspaceAppointments().then((all) => all.filter((a) => a.client_id === id))),
    settle(clientsApi.clientNotes(id)),
    settle(clientsApi.clientThread(id, 1000)),
    settle(clientsApi.clientWorkspaceFiles(id)),
  ]);
  return { client, profile, goals, habits, measurements, assessments, plans, meals, cycle, appointments, notes, messages, files };
}

/** Every meal plan for the client, with its meals. */
async function loadPlans(clientId: string): Promise<MealPlan[]> {
  const { items } = await mealPlansApi.list(clientId);
  return Promise.all(items.map((p) => (p.cards ? p : mealPlansApi.get(p.id))));
}

/** Download one client's record. */
export async function downloadClientRecord(client: RecordClient): Promise<void> {
  const brand = await resolvePdfBrand();
  const doc = renderClientRecord(await gatherClientRecord(client), brand);
  doc.save(recordFilename(client));
}

/**
 * Every client's record in one ZIP (one PDF each), for keeping a full copy of
 * the practice's client data. `onProgress(done, total)` drives a progress bar.
 */
export async function downloadAllClientRecords(
  clients: RecordClient[],
  practiceName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const brand = await resolvePdfBrand();
  const used = new Set<string>();
  let done = 0;
  for (const c of clients) {
    const doc = renderClientRecord(await gatherClientRecord(c), brand);
    let name = recordFilename(c);
    for (let n = 2; used.has(name); n++) name = recordFilename(c).replace(/\.pdf$/, `-${n}.pdf`);
    used.add(name);
    zip.file(name, doc.output('arraybuffer'));
    onProgress?.(++done, clients.length);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(practiceName) || 'practice'}-client-records-${todayIso()}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return done;
}

// ── Rendering ────────────────────────────────────────────────────────────

interface Ctx { doc: jsPDF; pageW: number; pageH: number; margin: number; y: number }

const GREY = 110;

export function renderClientRecord(r: ClientRecord, brand: PdfBrand): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const ctx: Ctx = { doc, pageW: doc.internal.pageSize.getWidth(), pageH: doc.internal.pageSize.getHeight(), margin: 44, y: 0 };
  const c = r.client;
  const p = r.profile.ok ? r.profile.value : null;

  drawCoverPage(doc, brand, {
    margin: ctx.margin,
    kind: 'CLIENT RECORD',
    title: 'Complete client record',
    subtitle: c.name,
    meta: [
      [c.email ?? p?.email, c.phone ?? p?.phone].filter(Boolean).join(' · '),
      c.joinedAt ? `Client since ${fmtDate(c.joinedAt)}` : '',
      [c.status ? `Status: ${humanize(c.status)}` : '', c.program && c.program !== '-' ? `Program: ${c.program}` : ''].filter(Boolean).join(' · '),
    ].filter(Boolean),
    generatedOn: `Generated ${fmtDate(new Date().toISOString())}`,
  });
  doc.addPage();
  ctx.y = drawBrandedHeader(doc, brand, {
    margin: ctx.margin,
    title: c.name,
    subtitle: 'Complete client record',
    rightMeta: `Generated ${fmtDate(new Date().toISOString())}`,
  });

  // Profile
  section(ctx, 'Profile');
  table(ctx, ['', ''], [
    ['Name', p?.name ?? c.name],
    ['Email', p?.email ?? c.email ?? ''],
    ['Phone', p?.phone ?? c.phone ?? ''],
    ['Age', p?.age != null ? String(p.age) : ''],
    ['Gender', humanize(p?.gender)],
    ['Height', p?.height_cm != null ? `${p.height_cm} cm` : ''],
    ['Activity level', humanize(p?.activity_level)],
    ['Goals', p?.goals ?? ''],
    ['Medical conditions', p?.medical_conditions ?? ''],
    ['Allergies', p?.allergies ?? ''],
    ['Food preferences', p?.food_preferences ?? ''],
    ['Service', humanize(p?.service_type)],
    ['Program', c.program && c.program !== '-' ? c.program : ''],
    ['Onboarded', p?.onboarded_at ? fmtDate(p.onboarded_at) : ''],
  ].map(([k, v]) => [k, v || '-']), { head: false, firstColWidth: 130 });
  if (!r.profile.ok) note(ctx, 'Profile details could not be loaded.');

  // Goals
  part(ctx, 'Goals', r.goals, (goals) => goals.length === 0 ? 'No goals set.' : table(ctx,
    ['Goal', 'Category', 'Target', 'Current', 'By', 'Status'],
    goals.map((g) => [g.title, humanize(g.category), g.target_value != null ? `${g.target_value} ${g.unit ?? ''}` : '-', `${g.current_value} ${g.unit ?? ''}`, g.target_date ? fmtDate(g.target_date) : '-', humanize(g.status)]),
  ));

  // Weight & daily habits
  part(ctx, 'Weight and daily habits (last 12 months)', r.habits, (days) => {
    const rows = days.filter((d) => !!d.weight_kg || d.water_ml > 0 || d.sleep_hours != null || d.exercise_minutes > 0 || d.mood != null || d.energy != null);
    if (rows.length === 0) return 'Nothing logged.';
    table(ctx, ['Date', 'Weight', 'Water', 'Sleep', 'Activity', 'Mood', 'Energy'], rows.map((d) => [
      fmtDate(d.date), d.weight_kg ? `${d.weight_kg} kg` : '-', d.water_ml ? `${(d.water_ml / 1000).toFixed(1)} L` : '-',
      d.sleep_hours != null ? `${d.sleep_hours} h` : '-', d.exercise_minutes ? `${d.exercise_minutes} min` : '-',
      d.mood != null ? `${d.mood}/5` : '-', d.energy != null ? `${d.energy}/5` : '-',
    ]));
  });

  // Measurements
  part(ctx, 'Body measurements (inches)', r.measurements, (ms) => ms.length === 0 ? 'No measurements recorded.' : table(ctx,
    ['Date', 'Waist', 'Hip', 'Chest', 'Arm', 'Thigh', 'Notes'],
    ms.map((m) => [fmtDate(m.recorded_at), n(m.waist_inches), n(m.hip_inches), n(m.chest_inches), n(m.arm_inches), n(m.thigh_inches), m.notes ?? '']),
  ));

  // Assessments, every answer
  part(ctx, 'Assessments', r.assessments, (cards) => {
    if (cards.length === 0) return 'No assessments sent.';
    for (const card of cards) renderAssessment(ctx, card);
  });

  // Meal plans
  part(ctx, 'Meal plans', r.plans, (plans) => {
    if (plans.length === 0) return 'No meal plans.';
    for (const plan of [...plans].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
      sub(ctx, `Week ${plan.week_number} · ${fmtDate(plan.start_date)} – ${fmtDate(plan.end_date)} · ${humanize(plan.status)}`);
      if (plan.notes) note(ctx, plainText(plan.notes));
      // Day by day, meals in the practice's meal-time order.
      const order = new Map((plan.meal_slots ?? []).map((m, i) => [m.slot as string, i]));
      const rank = (slot: string) => order.get(slot) ?? DEFAULT_SLOT_ORDER.indexOf(slot);
      const cards = [...(plan.cards ?? [])].sort((a, b) => a.day_number - b.day_number || rank(a.meal_type) - rank(b.meal_type));
      if (cards.length === 0) { note(ctx, 'No meals in this plan.'); continue; }
      table(ctx, ['Day', 'Meal time', 'Meal', 'Qty', 'kcal', 'P', 'C', 'F', 'Fibre'], cards.map((m) => [
        `Day ${m.day_number}`, slotLabel(plan, m.meal_type), m.meal_name, m.quantity != null ? `${m.quantity} ${m.unit ?? ''}` : '-',
        String(Math.round(m.kcal)), n(m.protein_g), n(m.carbs_g), n(m.fat_g), n(m.fiber_g ?? null),
      ]), { widths: { 0: 38, 1: 62, 3: 50, 4: 34, 5: 26, 6: 26, 7: 26, 8: 32 } });
    }
  });

  // Meal log
  part(ctx, 'Meal log (last 12 months)', r.meals, (meals) => meals.length === 0 ? 'No meals logged.' : table(ctx,
    ['When', 'Meal time', 'Food', 'kcal', 'P', 'C', 'F'],
    [...meals].sort((a, b) => a.logged_at.localeCompare(b.logged_at)).map((m) => {
      const s = (m.nutrition_snapshot ?? {}) as Record<string, unknown>;
      return [fmtDateTime(m.logged_at), humanize(m.meal_type), m.meal_name || m.detected_name || 'Meal',
        m.kcal != null ? String(Math.round(m.kcal)) : '-', n(num(s.protein_g)), n(num(s.carbohydrate_g ?? s.carbs_g)), n(num(s.fat_g))];
    }),
  ));

  // Cycle (only when used)
  if (r.cycle.ok && r.cycle.value.length > 0) {
    section(ctx, 'Menstrual cycle entries');
    table(ctx, ['Date', 'Entry', 'Flow', 'Notes'], r.cycle.value.map((e) => [fmtDate(e.event_date), humanize(e.event_type), e.flow_level != null ? String(e.flow_level) : '-', e.notes ?? '']));
  }

  // Appointments
  part(ctx, 'Appointments', r.appointments, (appts) => appts.length === 0 ? 'No appointments.' : table(ctx,
    ['When', 'Type', 'How', 'Length', 'Status'],
    [...appts].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map((a) => [fmtDateTime(a.scheduled_at), humanize(a.kind), humanize(a.mode), `${a.duration_minutes} min`, humanize(a.status)]),
  ));

  // Notes
  part(ctx, "Practice's private notes", r.notes, (notes) => notes.length === 0 ? 'No notes.' : table(ctx,
    ['Date', 'Note'], [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((x) => [fmtDate(x.created_at), x.content]), { firstColWidth: 80 },
  ));

  // Chat
  part(ctx, 'Messages', r.messages, (msgs) => msgs.length === 0 ? 'No messages.' : table(ctx,
    ['When', 'From', 'Message'],
    [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((m) => [
      fmtDateTime(m.created_at), m.sender_type === 'client' ? 'Client' : m.sender_type === 'admin' ? 'Practice' : 'NUSI',
      [m.content, m.attachment_name ? `[Attachment: ${m.attachment_name}]` : ''].filter(Boolean).join(' '),
    ]), { firstColWidth: 90 },
  ));

  // Files
  part(ctx, 'Files', r.files, (files) => files.length === 0 ? 'No files.' : table(ctx,
    ['File', 'Type', 'Size', 'Shared by', 'Date'],
    files.map((f) => [f.file_name, f.file_type ?? '-', f.file_size != null ? fmtBytes(f.file_size) : '-', f.uploaded_by === 'workspace' ? 'Practice' : 'Client', fmtDate(f.created_at)]),
  ));
  note(ctx, 'File contents are not included in this PDF; download them from the client\'s Files tab.');

  drawBrandedFooters(doc, brand, ctx.margin, { coverPage: true });
  return doc;
}

function renderAssessment(ctx: Ctx, card: AssessmentCard): void {
  const c = (card.generated_content ?? {}) as Record<string, unknown>;
  const title = (c.title as string) || humanize(card.card_type);
  const report = (c.report ?? null) as { score?: number | null; band?: string | null } | null;
  const review = (c.review ?? null) as { note?: string | null; reviewed_at?: string } | null;
  const bits = [
    card.sent_at ? `Sent ${fmtDate(card.sent_at)}` : '',
    card.has_responses ? 'Answered' : 'Not answered yet',
    report?.score != null ? `Score ${report.score}${report.band ? ` (${report.band})` : ''}` : '',
    review?.reviewed_at ? `Reviewed ${fmtDate(review.reviewed_at)}` : '',
  ].filter(Boolean).join(' · ');
  sub(ctx, `${title} — ${bits}`);
  if (review?.note) note(ctx, `Review note: ${review.note}`);
  if (!card.has_responses) return;
  const responses = (c.client_responses ?? {}) as Record<string, unknown>;
  const qs = Array.isArray(c.questions) ? (c.questions as Record<string, unknown>[]) : [];
  const rows: string[][] = [];
  qs.forEach((q, i) => {
    const text = (q.question ?? q.label) as string | undefined;
    if (!text) return;
    if (q.type === 'section') { rows.push([text.toUpperCase(), '']); return; }
    rows.push([text, answerText(responses[(q.id as string) ?? `q${i}`])]);
  });
  if (rows.length) table(ctx, ['Question', 'Answer'], rows, { firstColWidth: 230 });
}

/** Any answer shape (text, number, choices, yes/no, table) as readable text. */
function answerText(v: unknown): string {
  if (v == null || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(answerText).join(', ');
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x != null && x !== '')
      .map(([k, x]) => (typeof x === 'object' ? `${k}: ${answerText(x)}` : `${k}: ${x}`))
      .join('; ') || '-';
  }
  return String(v);
}

// ── Layout helpers ───────────────────────────────────────────────────────

function ensure(ctx: Ctx, h: number): void {
  if (ctx.y + h > ctx.pageH - 56) { ctx.doc.addPage(); ctx.y = 56; }
}

function section(ctx: Ctx, label: string): void {
  ensure(ctx, 60);
  ctx.y += 10;
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(12);
  ctx.doc.setTextColor(25);
  ctx.doc.text(label, ctx.margin, ctx.y);
  ctx.doc.setDrawColor(225);
  ctx.doc.setLineWidth(0.5);
  ctx.doc.line(ctx.margin, ctx.y + 5, ctx.pageW - ctx.margin, ctx.y + 5);
  ctx.doc.setFont('helvetica', 'normal');
  ctx.y += 18;
}

function sub(ctx: Ctx, label: string): void {
  const lines = ctx.doc.splitTextToSize(clean(label), ctx.pageW - ctx.margin * 2) as string[];
  ensure(ctx, 90 + lines.length * 12);
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(9.5);
  ctx.doc.setTextColor(45);
  ctx.doc.text(lines, ctx.margin, ctx.y + 4);
  ctx.doc.setFont('helvetica', 'normal');
  ctx.y += lines.length * 12 + 6;
}

function note(ctx: Ctx, text: string): void {
  const lines = ctx.doc.splitTextToSize(clean(text), ctx.pageW - ctx.margin * 2) as string[];
  ensure(ctx, lines.length * 11 + 6);
  ctx.doc.setFontSize(8.5);
  ctx.doc.setTextColor(GREY);
  ctx.doc.text(lines, ctx.margin, ctx.y);
  ctx.y += lines.length * 11 + 6;
}

function table(ctx: Ctx, head: string[], body: string[][], opts: { head?: boolean; firstColWidth?: number; widths?: Record<number, number> } = {}): void {
  ensure(ctx, 40);
  const widths: Record<number, { cellWidth: number; fontStyle?: 'bold' | 'normal' }> = {};
  for (const [i, w] of Object.entries(opts.widths ?? {})) widths[Number(i)] = { cellWidth: w };
  if (opts.firstColWidth) widths[0] = { cellWidth: opts.firstColWidth, fontStyle: opts.head === false ? 'bold' : 'normal' };
  autoTable(ctx.doc, {
    startY: ctx.y,
    margin: { left: ctx.margin, right: ctx.margin, top: 56, bottom: 56 },
    head: opts.head === false ? undefined : [head],
    body: body.map((row) => row.map((cell) => clean(cell))),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: 40, lineColor: 225, lineWidth: 0.4, overflow: 'linebreak' },
    headStyles: { fillColor: [244, 246, 244], textColor: 60, fontStyle: 'bold' },
    columnStyles: Object.keys(widths).length ? widths : undefined,
  });
  ctx.y = (ctx.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
}

/** A section whose data may have failed to load. */
function part<T>(ctx: Ctx, label: string, s: Settled<T>, render: (v: T) => string | void): void {
  section(ctx, label);
  if (!s.ok) { note(ctx, 'This part could not be loaded. Try downloading the record again.'); return; }
  const msg = render(s.value);
  if (typeof msg === 'string') note(ctx, msg);
}

// ── Formatting ───────────────────────────────────────────────────────────

const DEFAULT_SLOT_ORDER = ['early_morning', 'breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner', 'bedtime'];

/** Markdown notes as plain text: no #, **, list dashes kept as bullets, rules dropped. */
function plainText(md: string): string {
  return md
    .split('\n')
    .filter((l) => !/^\s*-{3,}\s*$/.test(l))
    .map((l) => l.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^\s*[-*]\s+/, '- '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Helvetica can't draw every character: map the common ones, drop the rest. */
function clean(s: string): string {
  return String(s ?? '')
    .replace(/\u20B9/g, 'Rs ')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/[^\t\n\r\u0020-\u007E\u00A0-\u00FF]/g, '');
}
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const n = (v: number | null | undefined): string => (v == null ? '-' : String(Math.round(v * 10) / 10));
const humanize = (s: string | null | undefined): string => (s ? s.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase()) : '');
const fmtDate = (iso: string): string => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtDateTime = (iso: string): string => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtBytes = (b: number): string => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const todayIso = (): string => new Date().toISOString().slice(0, 10);
const recordFilename = (c: RecordClient): string => `${slug(c.name) || 'client'}-record-${todayIso()}.pdf`;
