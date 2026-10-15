import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { TemplateQuestion } from './assessment-templates';

/** Question types that never hold an answer. */
const NON_ANSWER_TYPES = new Set(['section']);

export interface DailyFormDefinition {
  id: string;
  name: string;
  description: string | null;
  questions: TemplateQuestion[];
  reminder_time: string | null;
}

export interface DailyEntry {
  id: string;
  template_id: string;
  entry_date: string;
  responses: Record<string, unknown>;
  filled_count: number;
  field_count: number;
  submitted_at: Date | null;
}

export interface TodayForm {
  form: DailyFormDefinition;
  entry: DailyEntry | null;
}

export interface FieldSeriesPoint {
  entry_date: string;
  value: number;
}

export interface FieldSeries {
  field_id: string;
  label: string | null;
  unit: string | null;
  points: FieldSeriesPoint[];
  latest: number | null;
  average: number | null;
}

/**
 * Daily forms — an assessment form the client fills in every day.
 *
 * Differs from a one-off assessment in two ways, and this service exists for
 * exactly those two: the form reopens each day (one `daily_form_entries` row
 * per client per day), and every numeric answer is also written to
 * `daily_form_values` so it can be charted over time.
 *
 * Dates are the CLIENT'S local date, taken from the workspace timezone, so a
 * log written at 11pm belongs to that day rather than tomorrow in UTC.
 */
@Injectable()
export class DailyFormsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Today's date in the workspace's timezone, as YYYY-MM-DD. */
  private async localToday(workspaceId: string): Promise<string> {
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ d: string }>>(
      `SELECT to_char((now() AT TIME ZONE COALESCE(
                 (SELECT NULLIF(timezone, '') FROM public.workspaces WHERE id = $1::uuid),
                 'Asia/Kolkata')), 'YYYY-MM-DD') AS d`,
      workspaceId,
    );
    return row?.d ?? new Date().toISOString().slice(0, 10);
  }

  /** Answerable (non-section) questions. */
  private answerable(questions: unknown): TemplateQuestion[] {
    if (!Array.isArray(questions)) return [];
    return (questions as TemplateQuestion[]).filter((q) => q && !NON_ANSWER_TYPES.has(q.type));
  }

  /**
   * The daily form assigned to this client, plus today's entry if started.
   * Returns null when the client has no daily form — the app hides the card.
   */
  async todayForClient(clientId: string, workspaceId: string): Promise<TodayForm | null> {
    const [tpl] = await this.prisma.$queryRawUnsafe<Array<{
      id: string; name: string; description: string | null; questions: unknown; reminder_time: string | null;
    }>>(
      `SELECT id, name, description, questions, to_char(reminder_time, 'HH24:MI') AS reminder_time
         FROM public.assessment_form_templates
        WHERE workspace_id = $1::uuid AND repeat_daily = true AND archived = false
          AND status <> 'draft' AND $2::uuid = ANY(assigned_client_ids)
        ORDER BY updated_at DESC LIMIT 1`,
      workspaceId,
      clientId,
    );
    if (!tpl) return null;

    const today = await this.localToday(workspaceId);
    const [entry] = await this.prisma.$queryRawUnsafe<DailyEntry[]>(
      `SELECT id, template_id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
              responses, filled_count, field_count, submitted_at
         FROM public.daily_form_entries
        WHERE template_id = $1::uuid AND client_id = $2::uuid AND entry_date = $3::date
        LIMIT 1`,
      tpl.id,
      clientId,
      today,
    );

    return {
      form: {
        id: tpl.id,
        name: tpl.name,
        description: tpl.description,
        questions: Array.isArray(tpl.questions) ? (tpl.questions as TemplateQuestion[]) : [],
        reminder_time: tpl.reminder_time,
      },
      entry: entry ?? null,
    };
  }

  /**
   * Save (or update) a day's answers. Saving twice the same day updates the
   * same row, so a client can fill their morning readings and come back in
   * the evening for the rest.
   */
  async saveEntry(
    clientId: string,
    workspaceId: string,
    templateId: string,
    responses: Record<string, unknown>,
    entryDate?: string,
  ): Promise<DailyEntry> {
    if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
      throw new BadRequestException('responses must be an object.');
    }
    const [tpl] = await this.prisma.$queryRawUnsafe<Array<{ questions: unknown }>>(
      `SELECT questions FROM public.assessment_form_templates
        WHERE id = $1::uuid AND workspace_id = $2::uuid AND repeat_daily = true AND archived = false
          AND $3::uuid = ANY(assigned_client_ids) LIMIT 1`,
      templateId,
      workspaceId,
      clientId,
    );
    if (!tpl) throw new NotFoundException('Daily form not found or not assigned to you.');

    const fields = this.answerable(tpl.questions);
    const byId = new Map(fields.map((f) => [f.id, f]));
    // Ignore anything that isn't a question on this form.
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(responses)) {
      if (byId.has(k) && v !== null && v !== undefined && v !== '') clean[k] = v;
    }

    const date = entryDate ?? (await this.localToday(workspaceId));
    const [entry] = await this.prisma.$queryRawUnsafe<DailyEntry[]>(
      `INSERT INTO public.daily_form_entries
         (template_id, client_id, workspace_id, entry_date, responses, filled_count, field_count, submitted_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date, $5::jsonb, $6, $7, now())
       ON CONFLICT (template_id, client_id, entry_date) DO UPDATE
         SET responses = EXCLUDED.responses, filled_count = EXCLUDED.filled_count,
             field_count = EXCLUDED.field_count, submitted_at = now(), updated_at = now()
       RETURNING id, template_id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
                 responses, filled_count, field_count, submitted_at`,
      templateId,
      clientId,
      workspaceId,
      date,
      JSON.stringify(clean),
      Object.keys(clean).length,
      fields.length,
    );

    await this.writeValues(entry.id, clientId, templateId, date, clean, byId);
    return entry;
  }

  /**
   * Expand the numeric answers into one row each, so they can be charted.
   * Rewritten wholesale on every save: a cleared field disappears from the
   * chart rather than keeping yesterday's value.
   */
  private async writeValues(
    entryId: string,
    clientId: string,
    templateId: string,
    date: string,
    responses: Record<string, unknown>,
    byId: Map<string, TemplateQuestion>,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM public.daily_form_values WHERE entry_id = $1::uuid`,
      entryId,
    );
    const rows: Array<[string, number, string, string | null]> = [];
    for (const [fieldId, raw] of Object.entries(responses)) {
      const q = byId.get(fieldId);
      if (!q || (q.type !== 'number' && q.type !== 'scale')) continue;
      const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(value)) continue;
      rows.push([fieldId, value, q.question, unitOf(q.question)]);
    }
    if (!rows.length) return;

    // One statement; the list is at most ~150 fields.
    const values = rows
      .map((_, i) => `($1::uuid, $2::uuid, $3::uuid, $4::date, $${i * 4 + 5}, $${i * 4 + 6}::numeric, $${i * 4 + 7}, $${i * 4 + 8})`)
      .join(', ');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO public.daily_form_values
         (entry_id, client_id, template_id, entry_date, field_id, value, label, unit)
       VALUES ${values}
       ON CONFLICT (entry_id, field_id) DO UPDATE SET value = EXCLUDED.value`,
      entryId,
      clientId,
      templateId,
      date,
      ...rows.flat(),
    );
  }

  /** Recent entries for one client, newest first. */
  async history(clientId: string, limit = 30): Promise<DailyEntry[]> {
    return this.prisma.$queryRawUnsafe<DailyEntry[]>(
      `SELECT id, template_id, to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
              responses, filled_count, field_count, submitted_at
         FROM public.daily_form_entries
        WHERE client_id = $1::uuid
        ORDER BY entry_date DESC
        LIMIT $2`,
      clientId,
      Math.min(Math.max(limit, 1), 365),
    );
  }

  /** Each numeric field's values over the last N days, for the charts. */
  async series(clientId: string, days = 30): Promise<FieldSeries[]> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      field_id: string; label: string | null; unit: string | null; entry_date: string; value: string;
    }>>(
      `SELECT field_id, label, unit, to_char(entry_date, 'YYYY-MM-DD') AS entry_date, value
         FROM public.daily_form_values
        WHERE client_id = $1::uuid AND entry_date > now()::date - ($2::int || ' days')::interval
        ORDER BY field_id, entry_date`,
      clientId,
      Math.min(Math.max(days, 1), 365),
    );

    const out = new Map<string, FieldSeries>();
    for (const r of rows) {
      let s = out.get(r.field_id);
      if (!s) {
        s = { field_id: r.field_id, label: r.label, unit: r.unit, points: [], latest: null, average: null };
        out.set(r.field_id, s);
      }
      // Keep the newest label/unit, so a renamed question shows its new name.
      s.label = r.label ?? s.label;
      s.unit = r.unit ?? s.unit;
      s.points.push({ entry_date: r.entry_date, value: Number(r.value) });
    }
    for (const s of out.values()) {
      s.latest = s.points.length ? s.points[s.points.length - 1].value : null;
      s.average = s.points.length
        ? Math.round((s.points.reduce((a, p) => a + p.value, 0) / s.points.length) * 100) / 100
        : null;
    }
    return [...out.values()];
  }

  /**
   * Clients on a daily form and when they last logged — the nutritionist's
   * "who hasn't logged" list. Never logged sorts first.
   */
  async compliance(workspaceId: string): Promise<Array<{
    client_id: string; name: string | null; last_entry_date: string | null; days_since: number | null; logged_last_7: number;
  }>> {
    return this.prisma.$queryRawUnsafe(
      `WITH daily AS (
         SELECT unnest(assigned_client_ids) AS client_id
           FROM public.assessment_form_templates
          WHERE workspace_id = $1::uuid AND repeat_daily = true AND archived = false
       )
       SELECT c.id AS client_id, c.name,
              to_char(MAX(e.entry_date), 'YYYY-MM-DD') AS last_entry_date,
              (now()::date - MAX(e.entry_date))::int AS days_since,
              COUNT(e.id) FILTER (WHERE e.entry_date > now()::date - interval '7 days')::int AS logged_last_7
         FROM daily d
         JOIN public.clients c ON c.id = d.client_id AND c.status = 'active'
         LEFT JOIN public.daily_form_entries e ON e.client_id = c.id
        GROUP BY c.id, c.name
        ORDER BY days_since DESC NULLS FIRST, c.name`,
      workspaceId,
    );
  }
}

/**
 * Pull a unit out of a question label, e.g. "Hours of sleep last night" has
 * none but "Fasting blood glucose (mg/dL)" gives "mg/dL". A stop-gap until
 * the builder has a unit box of its own; kept here so the charts have axis
 * labels today.
 */
export function unitOf(question: string): string | null {
  const m = /\(([^()]{1,12})\)\s*$/.exec(question ?? '');
  if (!m) return null;
  const inner = m[1].trim();
  // "(1 = poor, 5 = excellent)" and friends are scales, not units.
  if (/[0-9]\s*=/.test(inner) || inner.includes(',')) return null;
  return inner;
}
