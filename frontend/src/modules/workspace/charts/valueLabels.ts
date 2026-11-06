/**
 * Printing a value next to every data point, without crowding.
 *
 * Practices asked twice for chart values to be readable without hovering.
 * Both earlier attempts failed the same way, so the rule is worth stating
 * once here rather than rediscovering it per chart:
 *
 * **Recharts calls `formatter(label)` with the value and NOTHING else.**
 * No index, no entry, no payload. Any thinning rule that needs to know WHICH
 * point it is looking at cannot live in the formatter - it reads undefined,
 * the arithmetic yields NaN, every label returns '' and the chart silently
 * renders none. It looks finished and does nothing.
 *
 * So the label text is computed into the DATA, and LabelList is pointed at
 * that field with no formatter at all.
 */

/** At most this many labels on one chart, however long the range. */
export const MAX_LABELS = 10;

/** Every Nth point carries a label, chosen so the count stays under the cap. */
export function labelStep(count: number, max = MAX_LABELS): number {
  return Math.max(1, Math.ceil(count / max));
}

/**
 * Add a `<key>__label` string to each row, blank on the rows that are thinned
 * out or have no value.
 *
 * `format` defaults to rounding, which is right for calories and most
 * markers; weight passes its own so 62.4 does not become 62.
 */
export function withValueLabels<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T & string,
  format: (v: number) => string = (v) => String(Math.round(v)),
  max = MAX_LABELS,
): Array<T & Record<string, unknown>> {
  const step = labelStep(rows.length, max);
  return rows.map((row, i) => ({
    ...row,
    [`${key}__label`]:
      i % step === 0 && typeof row[key] === 'number' ? format(row[key] as number) : '',
  }));
}

/* ───────────────────────────────────────────────────────────────────────────
 * Stepping through weeks and months.
 *
 * The sugar charts already let a coach walk one week or one month at a time,
 * and a practice asked for the same on calories and weight so the two read
 * alike during a call. The sugar versions take sugar-specific types; these
 * take plain dates, so any chart can use them.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Weeks containing at least one row, oldest first, each as its Monday. */
export function weeksWithData(dates: string[], startOfWeek: (iso: string) => string): string[] {
  return [...new Set(dates.map(startOfWeek))].sort();
}

/** Months containing at least one row, oldest first, as 'YYYY-MM'. */
export function monthsWithData(dates: string[]): string[] {
  return [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
}

/**
 * Clamp a navigator offset to the list it indexes.
 *
 * Stored as an offset from the newest entry rather than an absolute date, so
 * it survives new rows arriving while the screen is open; clamped rather than
 * validated so an offset past the end lands on the oldest entry instead of an
 * empty chart.
 */
export function clampIndex(back: number, length: number): number {
  return Math.min(Math.max(0, length - 1 + back), Math.max(0, length - 1));
}
