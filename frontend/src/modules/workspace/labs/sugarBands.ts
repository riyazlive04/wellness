/**
 * Blood sugar as a traffic-light chart: the bands behind the colours.
 *
 * Practices asked for a red/amber/green graph of daily fasting and post-meal
 * sugar. Colour on a glucose chart is only useful if it means something - a
 * wavy line with no sense of what is normal tells a client nothing - so the
 * bands come from published general reference values (ADA / ICMR) rather than
 * being picked to look distinct.
 *
 * What this deliberately does NOT do: diagnose. The labs module's own rule is
 * that a value is reported as above or below a range, never as 'abnormal', and
 * these bands follow it. A reading in the red band means "higher than the
 * usual reference range", which is a prompt to talk to the practitioner, not
 * a verdict. The UI labels them that way and says whose reference it is.
 *
 * Fasting and post-meal thresholds differ, and that matters: 130 mg/dL is
 * above range fasting but ordinary an hour after a meal. One shared cut-off
 * would mislabel one of the two.
 */

export type SugarBand = 'low' | 'normal' | 'borderline' | 'high';

/** Which markers this applies to - the glycaemic readings a client self-logs. */
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
  /** Where the chart's y-axis should stop when the data is well inside range. */
  axisMax: number;
}

/**
 * Fasting uses the 100 / 126 cut-offs; post-meal uses 140 / 200.
 *
 * The low edge is 70 for both: a hypo matters clinically and is the one case
 * where a LOW reading, not a high one, is the urgent one - so it gets its own
 * colour rather than being lumped in with 'normal'.
 */
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
 * The palette. Green / amber / red as asked, plus blue for a low reading.
 *
 * Low is blue rather than a second red because red already means "too high"
 * on this chart, and two different problems in one colour is how a client
 * misreads a hypo as a spike. Each colour carries a non-colour cue too (the
 * band label, and the dot shape in the tooltip) so the chart still works for
 * a red-green colourblind reader and in print.
 */
export const BAND_COLOR: Record<SugarBand, string> = {
  low: '#2563EB',        // blue-600
  normal: '#15803D',     // green-700
  borderline: '#B45309', // amber-700
  high: '#B91C1C',       // red-700
};

/** Translucent fills for the background bands behind the line. */
export const BAND_FILL: Record<SugarBand, string> = {
  low: 'rgba(37, 99, 235, 0.07)',
  normal: 'rgba(21, 128, 61, 0.09)',
  borderline: 'rgba(180, 83, 9, 0.09)',
  high: 'rgba(185, 28, 28, 0.09)',
};

export const BAND_LABEL: Record<SugarBand, string> = {
  low: 'Below range',
  normal: 'In range',
  borderline: 'Above range',
  high: 'Well above range',
};

/** Tailwind classes for a pill, matching the chart colours in both themes. */
export const BAND_CLASS: Record<SugarBand, string> = {
  low: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  normal: 'border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-300',
  borderline: 'border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-300',
  high: 'border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300',
};

/** Short label for a marker, for a chart legend or a tab. */
export const SUGAR_LABEL: Record<SugarMarker, string> = {
  fbs: 'Fasting',
  ppbs_meal1: 'After 1st meal',
  ppbs_meal2: 'After 2nd meal',
};

/** A distinct line colour per series, for the chart with all three together. */
export const SERIES_COLOR: Record<SugarMarker, string> = {
  fbs: '#0F766E',        // teal-700
  ppbs_meal1: '#C2410C', // orange-700
  ppbs_meal2: '#7E22CE', // purple-700
};

/**
 * The reference bands to draw behind a chart, bottom to top.
 *
 * `axisMax` is a floor, not a cap: a reading of 320 must stay on the chart, so
 * the caller raises the top to fit its own data and the high band stretches
 * with it.
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
