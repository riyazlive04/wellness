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

/* ───────────────────────────────────────────────────────────────────────────
 * Spike detection - a SECOND, independent signal from the bands above.
 *
 * Kept in this file, and byte-identical in meaning to the mobile copy at
 * src/lib/sugar-bands.ts, for the same reason the thresholds are: the two
 * repos have no shared package, so the rule is duplicated by hand and must be
 * changed in both at once or a phone and a laptop will disagree about which
 * dot is red.
 *
 * Why this cannot be done with the bands. The client's own example of a spike
 * was "90 jumping to 100+". Both of those are inside the normal fasting range,
 * so `sugarBand` calls both 'normal' and colours both green - correctly, as a
 * clinical statement. But a client whose fasting sugar sat at 90 all month and
 * is suddenly at 105 has changed, and that change is the thing worth a
 * conversation. So a spike is about a reading's RELATION TO ITS OWN HISTORY,
 * a band is about its absolute level, and the two are orthogonal:
 *   - in range, sharp jump   -> green band, spike flag   (the client's case)
 *   - above range, flat      -> red band, no spike flag  (chronic, known)
 * Neither may overwrite the other, so they are rendered as different things:
 * the band is the dot's FILL, the spike is a red RING plus a text reason.
 *
 * The rule, chosen to be reproducible and explainable rather than clever:
 *
 *   baseline = mean of this client's own readings for this marker in the 7
 *              days strictly BEFORE the reading's date
 *   spike    if value - baseline >= max(SPIKE_ABS_MIN, baseline * SPIKE_REL)
 *   and only if at least SPIKE_MIN_PRIOR readings went into the baseline
 *
 * Why a trailing 7-day mean of the client's OWN readings and not a fixed
 * number: a client who normally runs at 85 and one who normally runs at 150
 * are both "spiking" at a +15 jump, and only a personal baseline catches both
 * without drowning the second in flags.
 *
 * Why the margin is max(10 mg/dL, 10%):
 *   - 10 mg/dL absolute, because a home glucometer is permitted roughly 15%
 *     error, and day-to-day biological variation in a stable person is a few
 *     mg/dL. A margin much under 10 would flag meter noise every other day and
 *     the flag would stop meaning anything. The client's own example, 90 to 100,
 *     is exactly +10 and so does flag - the rule was calibrated to catch the
 *     case they asked for and no tighter.
 *   - 10% relative, so the margin grows with the baseline: at a baseline of 85
 *     the absolute floor governs (needs +10), at a baseline of 160 the relative
 *     term governs (needs +16), which is right because the same absolute jump
 *     is less remarkable on a higher, more variable baseline.
 *
 * Why at least 3 prior readings (SPIKE_MIN_PRIOR): a "7-day average" built
 * from one reading is just that reading, and comparing day 2 to day 1 would
 * flag every noisy second day of logging. Three is the smallest count where a
 * mean is not dominated by a single outlier, and it means a client who starts
 * logging gets no flags for their first few days - which is honest, because
 * there is nothing yet to be a spike against.
 *
 * A FALL IS NOT A SPIKE. Decision: a sharp fall gets its own quieter signal,
 * 'dip', using the same margin mirrored downwards, and it is NOT red and NOT
 * called a spike. Reasons: a fall in blood sugar is usually the goal of the
 * intervention, so colouring it with the alarm colour would punish success and
 * teach clients to ignore red; but a fall big enough to matter can also be a
 * medication or skipped-meal event a practitioner wants to see, and genuine
 * hypoglycaemia is already caught by the 'low' band at 70 regardless of
 * history. So 'dip' is rendered in the blue/neutral direction with a plain
 * text reason and no ring - visible if you look, never shouting.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Days of the client's own history the baseline averages over. */
export const SPIKE_WINDOW_DAYS = 7;
/** Smallest absolute rise over baseline that counts, in mg/dL. */
export const SPIKE_ABS_MIN = 10;
/** Rise as a fraction of baseline; the larger of the two margins wins. */
export const SPIKE_REL = 0.1;
/** Readings that must be in the baseline before anything can be flagged. */
export const SPIKE_MIN_PRIOR = 3;

export type SugarTrendFlag = 'spike' | 'dip' | null;

export interface SugarTrendPoint {
  takenOn: string;
  value: number;
  /** Mean of the trailing window, or null when there was not enough history. */
  baseline: number | null;
  /** How many readings went into `baseline`. */
  priorCount: number;
  /** value - baseline, rounded to 1dp; null when there is no baseline. */
  delta: number | null;
  flag: SugarTrendFlag;
}

/** Whole days between two YYYY-MM-DD dates; UTC, so DST cannot shift it. */
function dayGap(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Annotate a marker's readings with their trailing baseline and spike flag.
 *
 * Takes points in any order and returns them oldest-first. Each reading is
 * judged only against readings DATED BEFORE IT, never after, so the flags a
 * practitioner sees today are the same ones that were true on the day - the
 * flag is reproducible from the data alone, which is what makes it defensible
 * in a consultation.
 */
export function annotateSugarTrend(
  points: { takenOn: string; value: number }[],
): SugarTrendPoint[] {
  const sorted = [...points].sort((a, b) => a.takenOn.localeCompare(b.takenOn));

  return sorted.map((p, i) => {
    // Strictly earlier readings inside the window. Same-day readings are
    // excluded: a second fasting value typed for the same date is a
    // correction, not yesterday's news.
    const prior = sorted.slice(0, i).filter((q) => {
      const gap = dayGap(q.takenOn, p.takenOn);
      return gap > 0 && gap <= SPIKE_WINDOW_DAYS;
    });

    if (prior.length < SPIKE_MIN_PRIOR) {
      return {
        takenOn: p.takenOn,
        value: p.value,
        baseline: null,
        priorCount: prior.length,
        delta: null,
        flag: null,
      };
    }

    const baseline = prior.reduce((sum, q) => sum + q.value, 0) / prior.length;
    const delta = p.value - baseline;
    const margin = Math.max(SPIKE_ABS_MIN, baseline * SPIKE_REL);

    return {
      takenOn: p.takenOn,
      value: p.value,
      baseline: Math.round(baseline * 10) / 10,
      priorCount: prior.length,
      delta: Math.round(delta * 10) / 10,
      flag: delta >= margin ? 'spike' : delta <= -margin ? 'dip' : null,
    };
  });
}

/**
 * The sentence a practitioner or client reads to understand the flag.
 *
 * Written as the arithmetic, not as a verdict: "+14 vs your 7-day average of
 * 91" can be checked against the numbers on the chart, where "high spike"
 * cannot. This is the non-colour cue that makes the red ring accessible.
 */
export function sugarTrendReason(p: SugarTrendPoint): string | null {
  if (!p.flag || p.delta === null || p.baseline === null) return null;
  const sign = p.delta > 0 ? '+' : '';
  const word = p.flag === 'spike' ? 'above' : 'below';
  return `${sign}${p.delta} vs your ${SPIKE_WINDOW_DAYS}-day average of ${p.baseline} (${word} usual)`;
}

/** Red for a spike; the dip stays in the blue direction, never red. */
export const TREND_COLOR: Record<'spike' | 'dip', string> = {
  spike: '#DC2626', // red-600 - a brighter red than BAND_COLOR.high, and used
                    //            as an outline rather than a fill, so a dot can
                    //            carry a band colour and a spike ring at once
  dip: '#0369A1',   // sky-700
};

export const TREND_LABEL: Record<'spike' | 'dip', string> = {
  spike: 'Sharp rise',
  dip: 'Sharp fall',
};

/** Tailwind classes for a trend pill, matching the chart colours. */
export const TREND_CLASS: Record<'spike' | 'dip', string> = {
  spike: 'border-red-600/50 bg-red-600/10 text-red-700 dark:text-red-300',
  dip: 'border-sky-700/40 bg-sky-700/10 text-sky-700 dark:text-sky-300',
};

/**
 * Shown wherever spike flags appear, next to SUGAR_REFERENCE_NOTE.
 *
 * The bands and the flags answer different questions and a client will read
 * one as the other unless told, so the distinction is stated in words rather
 * than left to be inferred from a ring.
 */
export const SPIKE_NOTE =
  `A red ring marks a reading that rose at least ${SPIKE_ABS_MIN} mg/dL (or 10%) above your own `
  + `${SPIKE_WINDOW_DAYS}-day average, even when it is still inside the normal range. The band `
  + 'colours say how high a reading is; the ring says how fast it changed.';

/* ───────────────────────────────────────────────────────────────────────────
 * Weekly windows - Day 1..Day 7 of a chosen week.
 *
 * Also duplicated verbatim in the mobile copy, same rule as above.
 *
 * Weeks are Monday-based and anchored on the LATEST reading's week rather than
 * on today, so a client opening the chart after a week away lands on the week
 * they actually logged in instead of an empty one.
 *
 * The honest-gaps requirement lives here: every week yields exactly 7 slots,
 * and a day with no reading gets `value: null`, never 0. A zero would be drawn
 * as a dot on the floor of the chart and read as a catastrophic hypo, which is
 * the single worst thing this chart could say.
 * ─────────────────────────────────────────────────────────────────────────── */

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The Monday of the ISO week containing `iso`, as YYYY-MM-DD. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // getUTCDay: 0 = Sunday, so Sunday belongs to the week that began 6 days ago.
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** `iso` shifted by whole days, in UTC. */
export function addDays(iso: string, by: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

export interface SugarWeekDay {
  /** 1..7 - the "Day 1, Day 2, ... Day 7" the brief asks for. */
  day: number;
  takenOn: string;
  weekday: string;
  /** null means NOT LOGGED. Never 0. */
  value: number | null;
  /** The trend annotation for this day, when there is a reading. */
  trend: SugarTrendPoint | null;
}

/**
 * Slice annotated readings into the seven days of the week starting `start`.
 *
 * Takes the output of `annotateSugarTrend` so the baseline behind a flag is
 * computed over the FULL history, not over the visible week - otherwise the
 * first days of every week would lose their flags for want of prior readings,
 * and the week boundary would become a clinical fact, which it is not.
 */
export function sugarWeek(trend: SugarTrendPoint[], start: string): SugarWeekDay[] {
  const byDate = new Map(trend.map((p) => [p.takenOn, p]));
  return Array.from({ length: 7 }, (_, i) => {
    const takenOn = addDays(start, i);
    const p = byDate.get(takenOn) ?? null;
    return {
      day: i + 1,
      takenOn,
      weekday: WEEKDAY_SHORT[i],
      value: p ? p.value : null,
      trend: p,
    };
  });
}

/**
 * Every week that has at least one reading, oldest first.
 *
 * Weeks with no readings at all are omitted rather than paged through: a
 * client who logged in March and again in July should not have to click
 * through sixteen empty weeks. Gaps WITHIN a shown week still show as
 * not-logged days, which is the gap that actually tells the practitioner
 * something.
 */
export function sugarWeekStarts(trend: SugarTrendPoint[]): string[] {
  const set = new Set(trend.map((p) => weekStart(p.takenOn)));
  return [...set].sort();
}

/** 'Mon 27 Oct - Sun 2 Nov', the label on the week navigator. */
export function weekRangeLabel(start: string, locale = 'en-IN'): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      day: 'numeric', month: 'short', timeZone: 'UTC',
    });
  return `${fmt(start)} - ${fmt(addDays(start, 6))}`;
}
