/**
 * Lab results, client side — read-only except for daily self-monitoring.
 *
 * The practice owns what a lab report says, so this screen cannot create or
 * edit one. The one exception is the client's own glucometer: fasting and
 * post-meal sugar are theirs to record, because nobody else is in the room at
 * 7am. Those go in with `source: 'self'` server-side, so a practitioner
 * reading the trend can always tell a home reading from a venous draw.
 *
 * Shapes mirror the backend's LabHistory (backend/src/labs/labs.service.ts).
 */
import { api } from '@/lib/api';

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

const BASE = '/api/v1/me/labs';

export const labsApi = {
  /** Every marker this client has a result for, grouped into trend series. */
  mine: () => api.get<LabHistory>(BASE),

  /**
   * Record one day's self-measured readings. Returns the whole refreshed
   * history, so the chart updates from the response without a second request.
   * Re-sending the same day overwrites that day rather than stacking rows.
   */
  logSelf: (takenOn: string, readings: { markerCode: string; value: number }[]) =>
    api.post<LabHistory>(`${BASE}/self`, { body: { takenOn, readings } }),
};
