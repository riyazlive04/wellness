import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

import { LAB_PANELS, findMarker, markerByCode, panelLabel } from './lab-markers';
import { parseLabCard, type ParsedLabRow } from './lab-parse';

/**
 * LabsService — structured lab results.
 *
 * Rows reach this table two ways: imported from a submitted `lab_results`
 * assessment card, or typed in by a practitioner. Once here they are numbers, so
 * they can be trended across a program, flagged against the client's own
 * reference range, and read by the rest of the app.
 *
 * Flagging rule, applied consistently everywhere: a value is only ever compared
 * against a range that came off the client's OWN report (or, where the report
 * omitted one, the conservative catalogue fallback). We never assert a range the
 * lab did not use, and we never render a flag as a diagnosis — `status` is
 * 'low' | 'high' | 'normal' | 'unknown', deliberately not 'abnormal'.
 */
@Injectable()
export class LabsService {
  private readonly logger = new Logger(LabsService.name);

  constructor(private readonly prisma: PrismaService) {}

  assertWorkspace(workspaceId: string | null): string {
    if (!workspaceId) throw new ForbiddenException('Not in a workspace.');
    return workspaceId;
  }

  private async assertClientInWorkspace(workspaceId: string, clientId: string): Promise<void> {
    const [r] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
      clientId,
      workspaceId,
    );
    if (!r) throw new NotFoundException('Client not in this workspace.');
  }

  /** Resolve the caller's own client id, or 404. */
  private async clientIdOf(userId: string): Promise<string> {
    const [c] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM public.clients WHERE user_id = $1::uuid LIMIT 1`,
      userId,
    );
    if (!c) throw new NotFoundException('No client profile linked to this user.');
    return c.id;
  }

  // ════════════════════════════ READ ════════════════════════════════

  /**
   * A client's full lab history, grouped by marker and ordered oldest→newest
   * within each marker so the frontend can plot a series without re-sorting.
   */
  async history(clientId: string): Promise<LabHistory> {
    const rows = await this.prisma.$queryRawUnsafe<LabRow[]>(
      `SELECT id, panel, marker_code, marker_label,
              value::float AS value, value_text, unit,
              ref_low::float AS ref_low, ref_high::float AS ref_high, ref_text,
              taken_on::text AS taken_on, lab_name, fasting, source, source_card_id, notes, created_at
         FROM public.client_lab_results
        WHERE client_id = $1::uuid
        ORDER BY marker_code ASC, taken_on ASC, created_at ASC
        LIMIT 5000`,
      clientId,
    );

    const byMarker = new Map<string, LabSeries>();
    for (const r of rows) {
      let series = byMarker.get(r.marker_code);
      if (!series) {
        const marker = markerByCode(r.marker_code);
        series = {
          markerCode: r.marker_code,
          markerLabel: marker?.label ?? r.marker_label,
          panel: r.panel,
          panelLabel: panelLabel(r.panel),
          unit: r.unit ?? marker?.unit ?? null,
          higherIsWorse: marker?.higherIsWorse ?? null,
          points: [],
        };
        byMarker.set(r.marker_code, series);
      }
      series.points.push(toPoint(r));
      // Later rows win the unit: the newest report is the most likely to match
      // what the practitioner is looking at now.
      if (r.unit) series.unit = r.unit;
    }

    const series = [...byMarker.values()].map((s) => {
      const numeric = s.points.filter((p) => p.value !== null);
      const latest = numeric.length ? numeric[numeric.length - 1] : null;
      const previous = numeric.length > 1 ? numeric[numeric.length - 2] : null;
      return {
        ...s,
        latest,
        previous,
        // Direction of travel, not a judgement — the UI colours it using
        // higherIsWorse, which is null for markers where neither is 'better'.
        delta: latest && previous && latest.value !== null && previous.value !== null
          ? round(latest.value - previous.value)
          : null,
      };
    });

    // Panel order follows the catalogue (the order a report prints them),
    // markers alphabetical within a panel.
    const panelRank = new Map<string, number>(LAB_PANELS.map((p, i) => [p.code as string, i]));
    series.sort((a, b) =>
      (panelRank.get(a.panel) ?? 99) - (panelRank.get(b.panel) ?? 99) ||
      a.markerLabel.localeCompare(b.markerLabel));

    const flagged = series.filter((s) => s.latest && (s.latest.status === 'low' || s.latest.status === 'high'));

    return {
      series,
      totals: {
        markers: series.length,
        results: rows.length,
        flagged: flagged.length,
        lastTakenOn: rows.length ? rows.reduce((a, r) => (r.taken_on > a ? r.taken_on : a), rows[0].taken_on) : null,
      },
    };
  }

  async myHistory(userId: string): Promise<LabHistory> {
    return this.history(await this.clientIdOf(userId));
  }

  async historyForWorkspace(workspaceId: string, clientId: string): Promise<LabHistory> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    return this.history(clientId);
  }

  // ════════════════════════════ WRITE ═══════════════════════════════

  async create(workspaceId: string, clientId: string, userId: string, dto: CreateLabIn): Promise<LabRow> {
    await this.assertClientInWorkspace(workspaceId, clientId);

    const marker = findMarker(dto.markerCode ?? dto.markerLabel ?? '');
    if (!marker && !dto.markerLabel?.trim()) {
      throw new BadRequestException('Provide a known markerCode or a markerLabel.');
    }
    if (dto.value === undefined && !dto.valueText?.trim()) {
      throw new BadRequestException('Provide a value.');
    }
    if (dto.refLow != null && dto.refHigh != null && dto.refLow > dto.refHigh) {
      throw new BadRequestException('Reference low cannot exceed reference high.');
    }

    const [row] = await this.prisma.$queryRawUnsafe<LabRow[]>(
      `INSERT INTO public.client_lab_results
         (workspace_id, client_id, panel, marker_code, marker_label,
          value, value_text, unit, ref_low, ref_high, ref_text,
          taken_on, lab_name, fasting, source, notes, created_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5,
               $6::numeric, $7, $8, $9::numeric, $10::numeric, $11,
               $12::date, $13, $14::boolean, 'manual', $15, $16::uuid)
       RETURNING id, panel, marker_code, marker_label,
                 value::float AS value, value_text, unit,
                 ref_low::float AS ref_low, ref_high::float AS ref_high, ref_text,
                 taken_on::text AS taken_on, lab_name, fasting, source, source_card_id, notes, created_at`,
      workspaceId,
      clientId,
      marker?.panel ?? 'other',
      marker?.code ?? slugMarker(dto.markerLabel ?? ''),
      marker?.label ?? dto.markerLabel!.trim().slice(0, 120),
      dto.value ?? null,
      dto.valueText?.trim() || (dto.value != null ? String(dto.value) : null),
      dto.unit?.trim() || marker?.unit || null,
      dto.refLow ?? marker?.fallbackRef?.low ?? null,
      dto.refHigh ?? marker?.fallbackRef?.high ?? null,
      dto.refText?.trim() || null,
      dto.takenOn,
      dto.labName?.trim() || null,
      dto.fasting ?? null,
      dto.notes?.trim() || null,
      userId,
    );
    return row;
  }

  async update(workspaceId: string, clientId: string, id: string, dto: UpdateLabIn): Promise<LabRow> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    if (dto.refLow != null && dto.refHigh != null && dto.refLow > dto.refHigh) {
      throw new BadRequestException('Reference low cannot exceed reference high.');
    }

    const [row] = await this.prisma.$queryRawUnsafe<LabRow[]>(
      `UPDATE public.client_lab_results
          SET value     = COALESCE($4::numeric, value),
              value_text= COALESCE($5, value_text),
              unit      = COALESCE($6, unit),
              ref_low   = COALESCE($7::numeric, ref_low),
              ref_high  = COALESCE($8::numeric, ref_high),
              ref_text  = COALESCE($9, ref_text),
              taken_on  = COALESCE($10::date, taken_on),
              lab_name  = COALESCE($11, lab_name),
              fasting   = COALESCE($12::boolean, fasting),
              notes     = COALESCE($13, notes),
              updated_at= now()
        WHERE id = $1::uuid AND client_id = $2::uuid AND workspace_id = $3::uuid
       RETURNING id, panel, marker_code, marker_label,
                 value::float AS value, value_text, unit,
                 ref_low::float AS ref_low, ref_high::float AS ref_high, ref_text,
                 taken_on::text AS taken_on, lab_name, fasting, source, source_card_id, notes, created_at`,
      id,
      clientId,
      workspaceId,
      dto.value ?? null,
      dto.valueText?.trim() || null,
      dto.unit?.trim() || null,
      dto.refLow ?? null,
      dto.refHigh ?? null,
      dto.refText?.trim() || null,
      dto.takenOn ?? null,
      dto.labName?.trim() || null,
      dto.fasting ?? null,
      dto.notes?.trim() || null,
    );
    if (!row) throw new NotFoundException('Lab result not found.');
    return row;
  }

  async remove(workspaceId: string, clientId: string, id: string): Promise<{ id: string }> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const [row] = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `DELETE FROM public.client_lab_results
        WHERE id = $1::uuid AND client_id = $2::uuid AND workspace_id = $3::uuid
       RETURNING id`,
      id,
      clientId,
      workspaceId,
    );
    if (!row) throw new NotFoundException('Lab result not found.');
    return row;
  }

  // ════════════════════════ IMPORT FROM A FORM ══════════════════════

  /**
   * List submitted assessment cards for this client that look like lab reports,
   * with how many rows each would import. Drives the "Import from report" picker
   * so a practitioner never has to guess which submission holds the bloods.
   */
  async importableCards(workspaceId: string, clientId: string): Promise<ImportableCard[]> {
    await this.assertClientInWorkspace(workspaceId, clientId);

    const cards = await this.prisma.$queryRawUnsafe<Array<{
      id: string; card_type: string; generated_content: unknown; sent_at: string | null; created_at: string;
    }>>(
      `SELECT id, card_type, generated_content, sent_at, created_at
         FROM public.pending_review_cards
        WHERE client_id = $1::uuid
          AND workspace_id = $2::uuid
          AND (generated_content ? 'client_responses')
        ORDER BY created_at DESC
        LIMIT 100`,
      clientId,
      workspaceId,
    );

    const already = await this.prisma.$queryRawUnsafe<Array<{ source_card_id: string; n: bigint }>>(
      `SELECT source_card_id, count(*) AS n
         FROM public.client_lab_results
        WHERE client_id = $1::uuid AND source_card_id IS NOT NULL
        GROUP BY source_card_id`,
      clientId,
    );
    const importedBy = new Map(already.map((a) => [a.source_card_id, Number(a.n)]));

    const out: ImportableCard[] = [];
    for (const c of cards) {
      const parsed = this.parseCard(c.generated_content);
      if (!parsed.rows.length) continue;
      out.push({
        cardId: c.id,
        title: parsed.title,
        submittedAt: c.sent_at ?? c.created_at,
        reportDate: parsed.reportDate,
        labName: parsed.labName,
        rowCount: parsed.rows.length,
        unparsedCount: parsed.rows.filter((r) => r.unparsed).length,
        alreadyImported: importedBy.get(c.id) ?? 0,
      });
    }
    return out;
  }

  /** Parse without writing — the preview a practitioner confirms before importing. */
  async previewImport(workspaceId: string, clientId: string, cardId: string): Promise<ImportPreview> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const card = await this.loadCard(workspaceId, clientId, cardId);
    const parsed = this.parseCard(card.generated_content);
    return {
      cardId,
      title: parsed.title,
      reportDate: parsed.reportDate,
      labName: parsed.labName,
      fasting: parsed.fasting,
      rows: parsed.rows.map((r) => ({
        panel: r.panel,
        panelLabel: panelLabel(r.panel),
        markerCode: r.markerCode,
        markerLabel: r.markerLabel,
        value: r.value,
        valueText: r.valueText,
        unit: r.unit,
        refLow: r.refLow,
        refHigh: r.refHigh,
        refText: r.refText,
        takenOn: r.takenOn,
        status: statusOf(r.value, r.refLow, r.refHigh),
        unparsed: r.unparsed,
      })),
    };
  }

  /**
   * Import a submitted lab card into structured rows.
   *
   * Idempotent by (card, marker, date) via a partial unique index, so importing
   * twice updates rather than duplicates — a client who corrects a typo and
   * resubmits should not leave two conflicting points on the same trend line.
   */
  async importCard(
    workspaceId: string,
    clientId: string,
    userId: string,
    cardId: string,
  ): Promise<{ imported: number; skipped: number; unparsed: number }> {
    await this.assertClientInWorkspace(workspaceId, clientId);
    const card = await this.loadCard(workspaceId, clientId, cardId);
    const parsed = this.parseCard(card.generated_content);

    if (!parsed.rows.length) {
      throw new BadRequestException('No lab values could be read from this submission.');
    }

    let imported = 0;
    let skipped = 0;
    for (const r of parsed.rows) {
      // A row with no readable number still gets stored (value_text preserved)
      // so the practitioner can correct it in place rather than retyping it.
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO public.client_lab_results
             (workspace_id, client_id, panel, marker_code, marker_label,
              value, value_text, unit, ref_low, ref_high, ref_text,
              taken_on, lab_name, fasting, source, source_card_id, created_by)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5,
                   $6::numeric, $7, $8, $9::numeric, $10::numeric, $11,
                   $12::date, $13, $14::boolean, 'form', $15::uuid, $16::uuid)
           ON CONFLICT (source_card_id, marker_code, taken_on)
             WHERE source_card_id IS NOT NULL
             DO UPDATE SET value      = EXCLUDED.value,
                           value_text = EXCLUDED.value_text,
                           unit       = EXCLUDED.unit,
                           ref_low    = EXCLUDED.ref_low,
                           ref_high   = EXCLUDED.ref_high,
                           ref_text   = EXCLUDED.ref_text,
                           lab_name   = EXCLUDED.lab_name,
                           fasting    = EXCLUDED.fasting,
                           updated_at = now()`,
          workspaceId,
          clientId,
          r.panel,
          r.markerCode,
          r.markerLabel,
          r.value,
          r.valueText,
          r.unit,
          r.refLow,
          r.refHigh,
          r.refText,
          r.takenOn,
          parsed.labName,
          parsed.fasting,
          cardId,
          userId,
        );
        imported += 1;
      } catch (err) {
        skipped += 1;
        this.logger.warn(`lab import skipped ${r.markerCode} for client ${clientId}: ${(err as Error).message}`);
      }
    }

    return { imported, skipped, unparsed: parsed.rows.filter((r) => r.unparsed).length };
  }

  private async loadCard(workspaceId: string, clientId: string, cardId: string) {
    const [card] = await this.prisma.$queryRawUnsafe<Array<{ id: string; generated_content: unknown }>>(
      `SELECT id, generated_content
         FROM public.pending_review_cards
        WHERE id = $1::uuid AND client_id = $2::uuid AND workspace_id = $3::uuid
        LIMIT 1`,
      cardId,
      clientId,
      workspaceId,
    );
    if (!card) throw new NotFoundException('Assessment submission not found.');
    return card;
  }

  /**
   * Read a card's questions + client responses and parse every table on it.
   *
   * Runs over ANY submitted card rather than only the `lab_results` starter:
   * the test is whether it contains table answers that resolve to known markers,
   * which is both cheaper and more robust than matching on a template id that a
   * workspace is free to rename or rebuild.
   */
  private parseCard(generatedContent: unknown): {
    title: string; rows: ParsedLabRow[]; reportDate: string | null; labName: string | null; fasting: boolean | null;
  } {
    const gc = (generatedContent ?? {}) as {
      title?: string;
      questions?: Array<{ id: string; type?: string }>;
      client_responses?: Record<string, unknown>;
    };
    const questions = Array.isArray(gc.questions) ? gc.questions : [];
    const responses = gc.client_responses && typeof gc.client_responses === 'object'
      ? gc.client_responses as Record<string, unknown>
      : {};

    const parsed = parseLabCard(questions, responses);
    return { title: gc.title?.trim() || 'Assessment', ...parsed };
  }
}

// ── helpers ─────────────────────────────────────────────────────────

function slugMarker(label: string): string {
  return `other:${label.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Where a value sits against its range. 'unknown' whenever either the value or
 * the range is missing — the absence of a flag must never read as 'normal'.
 */
export function statusOf(
  value: number | null,
  refLow: number | null,
  refHigh: number | null,
): 'low' | 'high' | 'normal' | 'unknown' {
  if (value === null || (refLow === null && refHigh === null)) return 'unknown';
  if (refLow !== null && value < refLow) return 'low';
  if (refHigh !== null && value > refHigh) return 'high';
  return 'normal';
}

function toPoint(r: LabRow): LabPoint {
  return {
    id: r.id,
    value: r.value,
    valueText: r.value_text,
    unit: r.unit,
    refLow: r.ref_low,
    refHigh: r.ref_high,
    refText: r.ref_text,
    takenOn: r.taken_on,
    labName: r.lab_name,
    fasting: r.fasting,
    source: r.source,
    notes: r.notes,
    status: statusOf(r.value, r.ref_low, r.ref_high),
  };
}

// ── types ───────────────────────────────────────────────────────────

export interface LabRow {
  id: string;
  panel: string;
  marker_code: string;
  marker_label: string;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  taken_on: string;
  lab_name: string | null;
  fasting: boolean | null;
  source: string;
  source_card_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface LabPoint {
  id: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  takenOn: string;
  labName: string | null;
  fasting: boolean | null;
  source: string;
  notes: string | null;
  status: 'low' | 'high' | 'normal' | 'unknown';
}

export interface LabSeries {
  markerCode: string;
  markerLabel: string;
  panel: string;
  panelLabel: string;
  unit: string | null;
  higherIsWorse: boolean | null;
  points: LabPoint[];
  latest?: LabPoint | null;
  previous?: LabPoint | null;
  delta?: number | null;
}

export interface LabHistory {
  series: LabSeries[];
  totals: { markers: number; results: number; flagged: number; lastTakenOn: string | null };
}

export interface ImportableCard {
  cardId: string;
  title: string;
  submittedAt: string;
  reportDate: string | null;
  labName: string | null;
  rowCount: number;
  unparsedCount: number;
  alreadyImported: number;
}

export interface ImportPreview {
  cardId: string;
  title: string;
  reportDate: string | null;
  labName: string | null;
  fasting: boolean | null;
  rows: Array<{
    panel: string;
    panelLabel: string;
    markerCode: string;
    markerLabel: string;
    value: number | null;
    valueText: string | null;
    unit: string | null;
    refLow: number | null;
    refHigh: number | null;
    refText: string | null;
    takenOn: string;
    status: 'low' | 'high' | 'normal' | 'unknown';
    unparsed: boolean;
  }>;
}

export interface CreateLabIn {
  markerCode?: string;
  markerLabel?: string;
  value?: number;
  valueText?: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
  takenOn: string;
  labName?: string;
  fasting?: boolean;
  notes?: string;
}

export type UpdateLabIn = Partial<CreateLabIn>;
