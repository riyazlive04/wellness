/**
 * Blood sugar as a traffic-light chart: the bands behind the colours.
 *
 * Ported from the web's modules/workspace/labs/sugarBands.ts and kept in step
 * with it deliberately — a client glancing at the phone and a practitioner
 * looking at the same reading on a laptop must see the same colour, or the
 * colour means nothing. If a threshold changes, it changes in both.
 *
 * What this does NOT do: diagnose. A reading in the red band means "higher
 * than the usual reference range" — a prompt to talk to the practitioner, not
 * a verdict. Fasting and post-meal thresholds differ, and that matters:
 * 130 mg/dL is above range fasting but ordinary an hour after a meal.
 */

export type SugarBand = 'low' | 'normal' | 'borderline' | 'high';

/** The glycaemic readings a client can self-log; mirrors the backend allowlist. */
export const SUGAR_MARKERS = ['fbs', 'ppbs_meal1', 'ppbs_meal2'] as const;
export type SugarMarker = (typeof SUGAR_MARKERS)[number];

export function isSugarMarker(code: string): code is SugarMarker {
  return (SUGAR_MARKERS as readonly string[]).includes(code);
}

interface BandSpec {
  /** Below this is a low reading worth flagging separately from 'normal'. */
  low: number;
  /** Upper edge of the normal band. */
  normal: number;
  /** Upper edge of the borderline band; above it is the high band. */
  borderline: number;
  /** Where the y-axis stops when the data is well inside range. */
  axisMax: number;
}

const SPEC: Record<SugarMarker, BandSpec> = {
  fbs: { low: 70, normal: 100, borderline: 126, axisMax: 180 },
  ppbs_meal1: { low: 70, normal: 140, borderline: 200, axisMax: 240 },
  ppbs_meal2: { low: 70, normal: 140, borderline: 200, axisMax: 240 },
};

export function bandSpec(marker: SugarMarker): BandSpec {
  return SPEC[marker];
}

export function sugarBand(marker: SugarMarker, value: number): SugarBand {
  const s = SPEC[marker];
  if (value < s.low) return 'low';
  if (value < s.normal) return 'normal';
  if (value < s.borderline) return 'borderline';
  return 'high';
}

/**
 * Green / amber / red, plus blue for a low reading.
 *
 * Low is blue rather than a second red because red already means "too high"
 * here, and two different problems in one colour is how a client misreads a
 * hypo as a spike. Every colour is paired with a text label so the chart still
 * works for a red-green colourblind reader.
 */
export const BAND_COLOR: Record<SugarBand, string> = {
  low: '#2563EB',        // blue-600
  normal: '#15803D',     // green-700
  borderline: '#B45309', // amber-700
  high: '#B91C1C',       // red-700
};

export const BAND_LABEL: Record<SugarBand, string> = {
  low: 'Below range',
  normal: 'In range',
  borderline: 'Above range',
  high: 'Well above range',
};

export const SUGAR_LABEL: Record<SugarMarker, string> = {
  fbs: 'Fasting',
  ppbs_meal1: 'After 1st meal',
  ppbs_meal2: 'After 2nd meal',
};

/** Short form for a tab or a cramped chip. */
export const SUGAR_SHORT: Record<SugarMarker, string> = {
  fbs: 'Fasting',
  ppbs_meal1: '1st meal',
  ppbs_meal2: '2nd meal',
};

/** A distinct line colour per series, for a chart with all three together. */
export const SERIES_COLOR: Record<SugarMarker, string> = {
  fbs: '#0F766E',        // teal-700
  ppbs_meal1: '#C2410C', // orange-700
  ppbs_meal2: '#7E22CE', // purple-700
};

/**
 * The reference bands to draw behind a chart, bottom to top.
 *
 * `axisMax` is a floor, not a cap: a reading of 320 must stay on the chart, so
 * the top is raised to fit the data and the high band stretches with it.
 */
export function bandsFor(marker: SugarMarker, dataMax: number) {
  const s = SPEC[marker];
  const top = Math.max(s.axisMax, Math.ceil((dataMax + 20) / 20) * 20);
  return {
    top,
    bands: [
      { band: 'low' as SugarBand, from: 0, to: s.low },
      { band: 'normal' as SugarBand, from: s.low, to: s.normal },
      { band: 'borderline' as SugarBand, from: s.normal, to: s.borderline },
      { band: 'high' as SugarBand, from: s.borderline, to: top },
    ],
  };
}

/**
 * Where these numbers come from, shown under every sugar chart.
 *
 * Not decoration: a coloured chart of someone's glucose invites being read as
 * a diagnosis, and the one honest mitigation is saying plainly whose reference
 * it is and what it is not.
 */
export const SUGAR_REFERENCE_NOTE =
  'Bands follow general adult reference values (fasting 70-99, post-meal under 140 mg/dL). '
  + 'They are a guide for discussion with your practitioner, not a diagnosis, and your own '
  + 'targets may differ.';
