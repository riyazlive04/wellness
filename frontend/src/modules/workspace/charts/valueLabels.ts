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
