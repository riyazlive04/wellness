import { parseValue, parseRange, parseReportDate, parseLabTable, parseLabCard } from './lab-parse';
import { findMarker } from './lab-markers';
import { statusOf } from './labs.service';

/**
 * Parser tests — the risky half of the labs feature.
 *
 * Everything here arrives as text a client copied off a paper report, so the
 * cases below are drawn from how Indian lab reports actually print: DD/MM/YYYY
 * dates, lakh-grouped platelet counts, units glued to the digits, ranges written
 * six different ways.
 *
 * The load-bearing assertion throughout is the NEGATIVE one: an ambiguous cell
 * must yield `value: null`, not a guess. A missing point on a trend line is a
 * gap; a wrong one is a clinical error.
 */

describe('parseValue', () => {
  it('reads a plain number', () => {
    expect(parseValue('6.4').value).toBe(6.4);
  });

  it('strips a unit glued to the digits', () => {
    expect(parseValue('110mg/dL').value).toBe(110);
    expect(parseValue('110 mg/dL').value).toBe(110);
  });

  it('keeps the raw text alongside the parsed number', () => {
    expect(parseValue(' 6.4 % ').text).toBe('6.4 %');
  });

  it('records a bounding qualifier without losing the number', () => {
    expect(parseValue('<0.1')).toMatchObject({ value: 0.1, qualifier: '<' });
    expect(parseValue('> 1000')).toMatchObject({ value: 1000, qualifier: '>' });
    expect(parseValue('<=5')).toMatchObject({ value: 5, qualifier: '<' });
  });

  it('handles lakh-grouped counts as one number', () => {
    expect(parseValue('1,50,000').value).toBe(150000);
    expect(parseValue('4,500').value).toBe(4500);
  });

  it('treats a decimal comma as a decimal point', () => {
    expect(parseValue('6,4').value).toBe(6.4);
  });

  it('refuses a cell holding two different numbers', () => {
    // A range or a blood-pressure pair typed into the Result column.
    expect(parseValue('4.0 - 5.6').value).toBeNull();
    expect(parseValue('120/80').value).toBeNull();
  });

  it('returns null for non-numeric results but keeps the text', () => {
    expect(parseValue('Negative')).toMatchObject({ value: null, text: 'Negative' });
  });

  it('is empty-safe', () => {
    expect(parseValue('')).toMatchObject({ value: null, text: '' });
    expect(parseValue(null)).toMatchObject({ value: null, text: '' });
    expect(parseValue(undefined)).toMatchObject({ value: null, text: '' });
  });
});

describe('parseRange', () => {
  it('reads a hyphenated range', () => {
    expect(parseRange('4.0 - 5.6')).toMatchObject({ low: 4, high: 5.6 });
  });

  it('reads an en-dashed range', () => {
    expect(parseRange('70–100')).toMatchObject({ low: 70, high: 100 });
  });

  it('reads a "to" range', () => {
    expect(parseRange('0.4 to 4.0')).toMatchObject({ low: 0.4, high: 4 });
  });

  it('reads upper bounds in words and symbols', () => {
    expect(parseRange('< 200')).toMatchObject({ low: null, high: 200 });
    expect(parseRange('Up to 150')).toMatchObject({ low: null, high: 150 });
    expect(parseRange('Less than 100')).toMatchObject({ low: null, high: 100 });
  });

  it('reads lower bounds in words and symbols', () => {
    expect(parseRange('> 40')).toMatchObject({ low: 40, high: null });
    expect(parseRange('Above 40')).toMatchObject({ low: 40, high: null });
    expect(parseRange('At least 30')).toMatchObject({ low: 30, high: null });
  });

  it('refuses a bare number as a bound in either direction', () => {
    expect(parseRange('150')).toMatchObject({ low: null, high: null });
  });

  it('always preserves the printed text', () => {
    expect(parseRange('4.0 - 5.6').text).toBe('4.0 - 5.6');
    expect(parseRange('anything').text).toBe('anything');
    expect(parseRange('').text).toBeNull();
  });
});

describe('parseReportDate', () => {
  it('reads Indian day-first dates', () => {
    expect(parseReportDate('12/01/2026')).toBe('2026-01-12');
    expect(parseReportDate('05-03-2026')).toBe('2026-03-05');
  });

  it('reads ISO dates by shape, not by position', () => {
    expect(parseReportDate('2026-01-12')).toBe('2026-01-12');
  });

  it('expands two-digit years into this century', () => {
    expect(parseReportDate('12/01/26')).toBe('2026-01-12');
  });

  it('falls back to month-first only when day-first is impossible', () => {
    expect(parseReportDate('01/25/2026')).toBe('2026-01-25');
  });

  it('rejects dates that do not exist rather than rolling them forward', () => {
    expect(parseReportDate('31/02/2026')).toBeNull();
    expect(parseReportDate('45/45/2026')).toBeNull();
  });

  it('reads written month names', () => {
    expect(parseReportDate('12 Jan 2026')).toBe('2026-01-12');
  });

  it('is empty-safe', () => {
    expect(parseReportDate('')).toBeNull();
    expect(parseReportDate(null)).toBeNull();
    expect(parseReportDate('not a date')).toBeNull();
  });
});

describe('findMarker', () => {
  it('matches the exact starter-form row labels', () => {
    expect(findMarker('HbA1c')?.code).toBe('hba1c');
    expect(findMarker('SGPT / ALT')?.code).toBe('alt');
    expect(findMarker('Serum Creatinine')?.code).toBe('creatinine');
    expect(findMarker('AMH (Anti-Mullerian Hormone)')?.code).toBe('amh');
  });

  it('ignores case, spacing and punctuation', () => {
    expect(findMarker('sgpt-alt')?.code).toBe('alt');
    expect(findMarker('  HBA1C  ')?.code).toBe('hba1c');
  });

  it('matches the aliases Indian labs print', () => {
    expect(findMarker('TLC')?.code).toBe('tlc');
    expect(findMarker('SGOT')?.code).toBe('ast');
    expect(findMarker('Vit D')?.code).toBe('vitamin_d');
  });

  it('gives a loose alias to the marker that claims it first', () => {
    // 'cholesterol' must stay with Total Cholesterol rather than being stolen
    // by LDL/HDL/VLDL, which list it only as part of a longer alias.
    expect(findMarker('cholesterol')?.code).toBe('total_cholesterol');
  });

  it('returns null for something it does not know', () => {
    expect(findMarker('Homocysteine')).toBeNull();
    expect(findMarker('')).toBeNull();
  });
});

describe('parseLabTable', () => {
  const columns = { Result: '', Unit: '', Date: '', 'Reference Range': '' };

  it('parses a filled row into a typed result', () => {
    const [row] = parseLabTable(
      { HbA1c: { ...columns, Result: '6.4', Unit: '%', Date: '12/01/2026', 'Reference Range': '4.0 - 5.6' } },
      null,
    );
    expect(row).toMatchObject({
      panel: 'glycaemic',
      markerCode: 'hba1c',
      value: 6.4,
      unit: '%',
      refLow: 4,
      refHigh: 5.6,
      takenOn: '2026-01-12',
      unparsed: false,
    });
  });

  it('falls back to the report-header date when the row has none', () => {
    const [row] = parseLabTable({ HbA1c: { ...columns, Result: '6.4' } }, '2026-01-12');
    expect(row.takenOn).toBe('2026-01-12');
  });

  it('skips a row with no date anywhere rather than inventing one', () => {
    expect(parseLabTable({ HbA1c: { ...columns, Result: '6.4' } }, null)).toHaveLength(0);
  });

  it('skips blank rows — the form tells clients to leave unheld panels empty', () => {
    const rows = parseLabTable(
      { HbA1c: { ...columns, Result: '' }, TSH: { ...columns, Result: '   ' } },
      '2026-01-12',
    );
    expect(rows).toHaveLength(0);
  });

  it('keeps an unreadable value as text and marks it unparsed', () => {
    const [row] = parseLabTable({ TSH: { ...columns, Result: 'see attached' } }, '2026-01-12');
    expect(row).toMatchObject({ value: null, valueText: 'see attached', unparsed: true });
  });

  it('files an unknown marker under "other" without dropping it', () => {
    const [row] = parseLabTable({ Homocysteine: { ...columns, Result: '12' } }, '2026-01-12');
    expect(row).toMatchObject({ panel: 'other', markerLabel: 'Homocysteine', value: 12 });
    expect(row.markerCode).toMatch(/^other:/);
  });

  it('uses the catalogue unit when the report omitted one', () => {
    const [row] = parseLabTable({ HbA1c: { ...columns, Result: '6.4' } }, '2026-01-12');
    expect(row.unit).toBe('%');
  });

  it('applies the catalogue fallback range only when the report gave none', () => {
    const [withRange] = parseLabTable(
      { HbA1c: { ...columns, Result: '6.4', 'Reference Range': '4.0 - 6.0' } },
      '2026-01-12',
    );
    expect(withRange).toMatchObject({ refLow: 4, refHigh: 6 });

    const [without] = parseLabTable({ HbA1c: { ...columns, Result: '6.4' } }, '2026-01-12');
    expect(without.refHigh).toBe(5.6); // catalogue fallback
  });

  it('tolerates a renamed column header', () => {
    // A workspace may edit its installed copy of the starter form.
    const [row] = parseLabTable({ HbA1c: { Value: '6.4', Units: '%', Date: '12/01/2026' } }, null);
    expect(row).toMatchObject({ value: 6.4, unit: '%' });
  });

  it('is shape-safe against junk', () => {
    expect(parseLabTable(null, '2026-01-12')).toEqual([]);
    expect(parseLabTable('nope', '2026-01-12')).toEqual([]);
    expect(parseLabTable([], '2026-01-12')).toEqual([]);
    expect(parseLabTable({ HbA1c: 'not an object' }, '2026-01-12')).toEqual([]);
  });
});

describe('parseLabCard', () => {
  const questions = [
    { id: 'report_date', type: 'text' },
    { id: 'tbl_glycaemic', type: 'table' },
    { id: 'tbl_kft', type: 'table' },
    { id: 'other_markers', type: 'text' },
  ];

  it('walks every table on the card and picks up the header metadata', () => {
    const out = parseLabCard(questions, {
      report_date: '12/01/2026',
      lab_name: 'Apollo Diagnostics',
      fasting_sample: 'Yes - fasting',
      tbl_glycaemic: { HbA1c: { Result: '6.4', Unit: '%' } },
      tbl_kft: { 'Serum Creatinine': { Result: '0.9', Unit: 'mg/dL' } },
      other_markers: 'Homocysteine 12 umol/L',
    });

    expect(out.reportDate).toBe('2026-01-12');
    expect(out.labName).toBe('Apollo Diagnostics');
    expect(out.fasting).toBe(true);
    expect(out.rows.map((r) => r.markerCode).sort()).toEqual(['creatinine', 'hba1c']);
  });

  it('reads a non-fasting sample as false and an unsure one as null', () => {
    const base = { report_date: '12/01/2026', tbl_glycaemic: { HbA1c: { Result: '6' } } };
    expect(parseLabCard(questions, { ...base, fasting_sample: 'No - non-fasting' }).fasting).toBe(false);
    expect(parseLabCard(questions, { ...base, fasting_sample: 'Not sure' }).fasting).toBeNull();
    expect(parseLabCard(questions, base).fasting).toBeNull();
  });

  it('ignores non-table questions', () => {
    const out = parseLabCard(questions, { report_date: '12/01/2026', other_markers: 'HbA1c 6.4' });
    expect(out.rows).toHaveLength(0);
  });

  it('returns nothing for a card that is not a lab report', () => {
    const out = parseLabCard([{ id: 'main_concern', type: 'text' }], { main_concern: 'weight loss' });
    expect(out.rows).toHaveLength(0);
  });
});

describe('statusOf', () => {
  it('flags below and above the range', () => {
    expect(statusOf(3, 4, 6)).toBe('low');
    expect(statusOf(7, 4, 6)).toBe('high');
    expect(statusOf(5, 4, 6)).toBe('normal');
  });

  it('treats the bounds themselves as normal', () => {
    expect(statusOf(4, 4, 6)).toBe('normal');
    expect(statusOf(6, 4, 6)).toBe('normal');
  });

  it('works with a one-sided range', () => {
    expect(statusOf(250, null, 200)).toBe('high');
    expect(statusOf(30, 40, null)).toBe('low');
    expect(statusOf(50, 40, null)).toBe('normal');
  });

  it('never reads a missing value or range as normal', () => {
    expect(statusOf(null, 4, 6)).toBe('unknown');
    expect(statusOf(5, null, null)).toBe('unknown');
  });
});
