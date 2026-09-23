import { api } from '@/lib/api';

/**
 * Structured lab results — the typed layer over the values the `lab_results`
 * assessment form collects as free text.
 */

export type LabStatus = 'low' | 'high' | 'normal' | 'unknown';

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
  source: 'manual' | 'form';
  notes: string | null;
  status: LabStatus;
}

export interface LabSeries {
  markerCode: string;
  markerLabel: string;
  panel: string;
  panelLabel: string;
  unit: string | null;
  /** null where neither direction is 'better' (TSH, ferritin, MCV…). */
  higherIsWorse: boolean | null;
  points: LabPoint[];
  latest: LabPoint | null;
  previous: LabPoint | null;
  delta: number | null;
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
  /** How many rows a previous import of this same card already wrote. */
  alreadyImported: number;
}

export interface ImportPreviewRow {
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
  status: LabStatus;
  unparsed: boolean;
}

export interface ImportPreview {
  cardId: string;
  title: string;
  reportDate: string | null;
  labName: string | null;
  fasting: boolean | null;
  rows: ImportPreviewRow[];
}

export interface LabMarkerOption {
  code: string;
  label: string;
  panel: string;
  unit: string | null;
  fallbackRef: { low: number | null; high: number | null } | null;
  higherIsWorse: boolean | null;
}

export interface LabCatalogue {
  panels: Array<{ code: string; label: string }>;
  markers: LabMarkerOption[];
}

export interface LabInput {
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

const base = (clientId: string) => `/api/v1/workspaces/me/clients/${clientId}/labs`;

export const labsApi = {
  history: (clientId: string) => api.get<LabHistory>(base(clientId)),

  catalogue: () => api.get<LabCatalogue>('/api/v1/workspaces/me/lab-markers'),

  importable: (clientId: string) => api.get<ImportableCard[]>(`${base(clientId)}/importable`),

  previewImport: (clientId: string, cardId: string) =>
    api.get<ImportPreview>(`${base(clientId)}/importable/${cardId}/preview`),

  importCard: (clientId: string, cardId: string) =>
    api.post<{ imported: number; skipped: number; unparsed: number }>(`${base(clientId)}/import/${cardId}`),

  create: (clientId: string, body: LabInput) => api.post<LabPoint>(base(clientId), { body }),

  update: (clientId: string, id: string, body: Partial<LabInput>) =>
    api.patch<LabPoint>(`${base(clientId)}/${id}`, { body }),

  remove: (clientId: string, id: string) => api.delete<{ id: string }>(`${base(clientId)}/${id}`),
};

/** Client portal — read-only. */
export const myLabsApi = {
  history: () => api.get<LabHistory>('/api/v1/me/labs'),
};

// ── shared display helpers ──────────────────────────────────────────

export const STATUS_LABEL: Record<LabStatus, string> = {
  low: 'Below range',
  high: 'Above range',
  normal: 'In range',
  unknown: 'No range',
};

/**
 * Tailwind classes per status. 'unknown' is deliberately neutral, never green:
 * a value we cannot compare must not read as a clean result.
 */
export const STATUS_CLASS: Record<LabStatus, string> = {
  low: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  high: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  normal: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  unknown: 'bg-foreground/[0.06] text-foreground/55',
};

/**
 * Whether a change between two readings is an improvement.
 *
 * Returns null — meaning "show the movement, don't colour it" — whenever the
 * marker has no better direction (TSH, ferritin, MCV) or nothing moved. Colouring
 * a TSH drop green would be a clinical claim the app has no business making.
 */
export function deltaTone(delta: number | null, higherIsWorse: boolean | null): 'good' | 'bad' | null {
  if (delta === null || delta === 0 || higherIsWorse === null) return null;
  const rising = delta > 0;
  return rising === higherIsWorse ? 'bad' : 'good';
}

/** Format a point for display, preferring the number and falling back to raw text. */
export function formatPoint(p: Pick<LabPoint, 'value' | 'valueText' | 'unit'>): string {
  if (p.value === null) return p.valueText ?? '—';
  const n = Number.isInteger(p.value) ? String(p.value) : String(Number(p.value.toFixed(3)));
  return p.unit ? `${n} ${p.unit}` : n;
}

/** 'Up to 5.6' / '4.0–5.6' / '≥ 40' — the range as a short display string. */
export function formatRange(refLow: number | null, refHigh: number | null, refText: string | null): string | null {
  if (refText) return refText;
  if (refLow !== null && refHigh !== null) return `${refLow}–${refHigh}`;
  if (refHigh !== null) return `≤ ${refHigh}`;
  if (refLow !== null) return `≥ ${refLow}`;
  return null;
}
