/**
 * Parsers for lab values typed off a paper report.
 *
 * The `lab_results` form deliberately asks the client to copy the result, unit
 * and reference range "exactly as printed", because a client cannot be asked to
 * normalise their own report. That means everything arriving here is messy:
 * '6.4 %', '<0.1', '110mg/dl', '4.0 - 5.6', 'Up to 150', '12/01/2026'.
 *
 * Design rule throughout: never invent a number. Anything that does not parse
 * cleanly is kept as text on the row (`value_text`) with `value` left null, so
 * it still shows in the client's history and is still reviewable — it just
 * doesn't enter a trend line or get flagged against a range. A wrong number on a
 * lab chart is far more dangerous than a missing one.
 */

import { findMarker, type LabMarker } from './lab-markers';

export interface ParsedValue {
  value: number | null;
  /** What the client actually typed, trimmed. Always kept. */
  text: string;
  /** '<' or '>' when the report gave a bounded result ('<0.1'). */
  qualifier: '<' | '>' | null;
}

/**
 * Pull a number out of a result cell.
 *
 * Handles a leading qualifier, a unit stuck to the digits, Indian-format commas
 * ('1,50,000') and a decimal comma ('6,4'). A cell containing more than one
 * distinct number is treated as unparseable rather than guessed at.
 */
export function parseValue(raw: unknown): ParsedValue {
  const text = String(raw ?? '').trim();
  if (!text) return { value: null, text: '', qualifier: null };

  let qualifier: '<' | '>' | null = null;
  let body = text;
  const q = /^\s*(<=|>=|<|>)\s*/.exec(body);
  if (q) {
    qualifier = q[1].startsWith('<') ? '<' : '>';
    body = body.slice(q[0].length);
  }

  // Strip thousands separators only between digits, so a decimal comma survives.
  const cleaned = body.replace(/(\d),(?=\d{2,3}\b)/g, '$1');
  const matches = cleaned.match(/-?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length === 0) return { value: null, text, qualifier };

  const nums = matches.map((m) => Number(m.replace(',', '.'))).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { value: null, text, qualifier };
  // '120 / 80' or '4.0 - 5.6' in a result cell is ambiguous — refuse it.
  if (nums.length > 1 && new Set(nums).size > 1) return { value: null, text, qualifier };

  return { value: nums[0], text, qualifier };
}

export interface ParsedRange {
  low: number | null;
  high: number | null;
  /** The range exactly as printed, kept for display even when parsed. */
  text: string | null;
}

/**
 * Parse a reference range cell.
 *
 * Recognises '4.0 - 5.6', '4.0 to 5.6', '70–100' (en dash), '< 200', '> 40',
 * 'Up to 150', 'Less than 100', 'Above 40'. Single bare numbers are NOT read as
 * a bound in either direction — '150' alone is genuinely ambiguous.
 */
export function parseRange(raw: unknown): ParsedRange {
  const text = String(raw ?? '').trim();
  if (!text) return { low: null, high: null, text: null };

  const norm = text
    .replace(/[\u2010-\u2015\u2212]/g, '-')   // figure/en/em dash, minus sign
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const num = (s: string): number | null => {
    const n = Number(s.replace(/,(?=\d{2,3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  // Bounded: '4.0 - 5.6' / '4.0 to 5.6'
  const between = /(-?\d+(?:[.,]\d+)?)\s*(?:-|to)\s*(-?\d+(?:[.,]\d+)?)/.exec(norm);
  if (between) {
    const low = num(between[1]);
    const high = num(between[2]);
    if (low !== null && high !== null && low <= high) return { low, high, text };
  }

  // Upper bound only: '< 200', '<=200', 'up to 150', 'less than 100', 'below 100'
  const upper = /(?:<=?|up to|less than|below|under|max(?:imum)?(?: of)?)\s*(-?\d+(?:[.,]\d+)?)/.exec(norm);
  if (upper) {
    const high = num(upper[1]);
    if (high !== null) return { low: null, high, text };
  }

  // Lower bound only: '> 40', '>=40', 'above 40', 'more than 40', 'at least 40'
  const lower = /(?:>=?|above|more than|greater than|over|at least|min(?:imum)?(?: of)?)\s*(-?\d+(?:[.,]\d+)?)/.exec(norm);
  if (lower) {
    const low = num(lower[1]);
    if (low !== null) return { low, high: null, text };
  }

  return { low: null, high: null, text };
}

/**
 * Parse a date typed off a report.
 *
 * Day-first is assumed when it is ambiguous ('05/03/2026' is 5 March), because
 * every Indian lab prints DD/MM/YYYY and the form's audience is Indian. ISO
 * (YYYY-MM-DD) is detected by shape and read correctly regardless. Two-digit
 * years map into 2000-2099. Returns an ISO date string, or null.
 */
export function parseReportDate(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    // Only reinterpret as month-first when day-first is impossible.
    if (day > 12 && month > 12) return null;
    if (day > 31 || month > 12) {
      if (month <= 31 && day <= 12) [day, month] = [month, day];
      else return null;
    }
    return buildDate(year, month, day);
  }

  // '12 Jan 2026' / 'Jan 12, 2026'. Date.parse reads a bare date as LOCAL
  // midnight, so the calendar date must be read back with the local getters —
  // reading it as UTC shifts it a day backwards everywhere east of Greenwich,
  // IST included.
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    const d = new Date(parsed);
    return buildDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function buildDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February and friends rather than silently rolling into March.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** One parsed row, ready to become a client_lab_results record. */
export interface ParsedLabRow {
  panel: string;
  markerCode: string;
  markerLabel: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  takenOn: string;
  /** True when the value cell had content but no number could be read from it. */
  unparsed: boolean;
}

/** A `table` answer: { [rowLabel]: { [columnHeader]: value } }. */
type TableAnswer = Record<string, Record<string, string>>;

/**
 * Find a cell by column header, tolerating the header wording drifting — a
 * workspace is free to edit the installed copy of the starter form, and
 * 'Result' becoming 'Value' must not silently stop the import.
 */
function cell(row: Record<string, unknown>, ...candidates: string[]): string {
  const keys = Object.keys(row ?? {});
  for (const want of candidates) {
    const hit = keys.find((k) => k.trim().toLowerCase() === want);
    if (hit && String(row[hit] ?? '').trim()) return String(row[hit]).trim();
  }
  for (const want of candidates) {
    const hit = keys.find((k) => k.trim().toLowerCase().includes(want));
    if (hit && String(row[hit] ?? '').trim()) return String(row[hit]).trim();
  }
  return '';
}

/**
 * Turn one table answer into parsed rows.
 *
 * `defaultDate` is the report date from the form header, used for any row whose
 * own Date cell is blank — clients routinely fill the header date and then leave
 * the per-row dates empty because every marker came off the same report.
 *
 * Rows whose result cell is empty are skipped entirely: the form explicitly
 * tells clients to leave panels they do not have blank, so a blank is an absence
 * of data, never a zero.
 */
export function parseLabTable(answer: unknown, defaultDate: string | null): ParsedLabRow[] {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return [];
  const table = answer as TableAnswer;
  const out: ParsedLabRow[] = [];

  for (const [rowLabel, cells] of Object.entries(table)) {
    if (!cells || typeof cells !== 'object' || Array.isArray(cells)) continue;

    const resultRaw = cell(cells as Record<string, unknown>, 'result', 'value', 'reading');
    if (!resultRaw) continue;

    const marker: LabMarker | null = findMarker(rowLabel);
    const parsed = parseValue(resultRaw);
    const range = parseRange(cell(cells as Record<string, unknown>, 'reference range', 'reference', 'range', 'normal'));
    const takenOn = parseReportDate(cell(cells as Record<string, unknown>, 'date', 'tested on', 'taken')) ?? defaultDate;

    // No date anywhere means the point cannot be placed on a trend line, and a
    // guessed date would corrupt the series. Skip rather than invent one.
    if (!takenOn) continue;

    const unit = cell(cells as Record<string, unknown>, 'unit', 'units') || marker?.unit || null;
    const fallback = range.low === null && range.high === null ? marker?.fallbackRef ?? null : null;

    out.push({
      panel: marker?.panel ?? 'other',
      markerCode: marker?.code ?? `other:${rowLabel.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`,
      markerLabel: marker?.label ?? rowLabel.trim().slice(0, 120),
      value: parsed.value,
      valueText: parsed.text || null,
      unit,
      refLow: range.low ?? fallback?.low ?? null,
      refHigh: range.high ?? fallback?.high ?? null,
      refText: range.text,
      takenOn,
      unparsed: parsed.value === null,
    });
  }

  return out;
}

/**
 * Extract every lab row from a submitted `lab_results` assessment card.
 *
 * Walks the card's own question list rather than hardcoding the eight `tbl_*`
 * ids, so a workspace that adds a panel to its copy of the form gets those rows
 * imported too — they land under the 'other' panel if the marker is unknown.
 */
export function parseLabCard(
  questions: Array<{ id: string; type?: string }>,
  responses: Record<string, unknown>,
): { rows: ParsedLabRow[]; reportDate: string | null; labName: string | null; fasting: boolean | null } {
  const reportDate = parseReportDate(responses['report_date']);
  const labNameRaw = String(responses['lab_name'] ?? '').trim();
  // Word-boundary matched on purpose: the third option is 'Not sure', and a
  // loose startsWith('no') would record it as a confirmed non-fasting sample.
  const fastingRaw = String(responses['fasting_sample'] ?? '').trim().toLowerCase();
  const fasting = /^yes\b/.test(fastingRaw) ? true : /^no\b/.test(fastingRaw) ? false : null;

  const rows: ParsedLabRow[] = [];
  for (const q of questions) {
    if (q?.type !== 'table') continue;
    rows.push(...parseLabTable(responses[q.id], reportDate));
  }

  return { rows, reportDate, labName: labNameRaw || null, fasting };
}
