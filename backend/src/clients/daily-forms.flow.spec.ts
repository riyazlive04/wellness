import { DailyFormsService } from './daily-forms.service';
import type { PrismaService } from '../database/prisma.service';

/**
 * Covers the save path end to end against a stubbed database, because the
 * bugs that matter here are in what we write, not in Postgres: which answers
 * are kept, which become chartable numbers, and that re-saving a day replaces
 * the old values rather than appending to them.
 */
function makeService() {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const prisma = {
    $queryRawUnsafe: jest.fn(async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes("to_char((now() AT TIME ZONE")) return [{ d: '2026-10-15' }];
      if (sql.includes('FROM public.assessment_form_templates')) {
        return [{
          questions: [
            { id: 'sec_a', question: 'A. Blood sugar', type: 'section' },
            { id: 'glucose_fasting', question: 'Fasting blood glucose (mg/dL)', type: 'number' },
            { id: 'blood_pressure', question: 'Blood pressure (mmHg, e.g. 120/80)', type: 'text' },
            { id: 'sleep_quality', question: 'Sleep quality (1 = poor, 5 = excellent)', type: 'scale', max: 5 },
            { id: 'oil_bath', question: 'Did you have an oil bath today?', type: 'yesno' },
          ],
        }];
      }
      if (sql.includes('INSERT INTO public.daily_form_entries')) {
        return [{
          id: 'entry-1', template_id: 'tpl-1', entry_date: '2026-10-15',
          responses: args[4], filled_count: args[5], field_count: args[6], submitted_at: new Date(),
        }];
      }
      return [];
    }),
    $executeRawUnsafe: jest.fn(async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return 1;
    }),
  } as unknown as PrismaService;
  return { svc: new DailyFormsService(prisma), calls, prisma };
}

const TPL = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';

describe('DailyFormsService.saveEntry', () => {
  it('keeps only answers that belong to the form', async () => {
    const { svc, calls } = makeService();
    await svc.saveEntry(CLIENT, WS, TPL, {
      glucose_fasting: 96,
      not_on_this_form: 'should be dropped',
      sec_a: 'sections are not answerable',
    });
    const insert = calls.find((c) => c.sql.includes('INSERT INTO public.daily_form_entries'))!;
    const stored = JSON.parse(insert.args[4] as string);
    expect(stored).toEqual({ glucose_fasting: 96 });
    // 5 questions minus the section header.
    expect(insert.args[6]).toBe(4);
  });

  it('drops blanks so a skipped field is not counted as filled', async () => {
    const { svc, calls } = makeService();
    await svc.saveEntry(CLIENT, WS, TPL, {
      glucose_fasting: 96,
      blood_pressure: '',
      sleep_quality: null,
      oil_bath: undefined,
    });
    const insert = calls.find((c) => c.sql.includes('INSERT INTO public.daily_form_entries'))!;
    expect(JSON.parse(insert.args[4] as string)).toEqual({ glucose_fasting: 96 });
    expect(insert.args[5]).toBe(1);
  });

  it('charts numbers and scales, but not text or yes/no', async () => {
    const { svc, calls } = makeService();
    await svc.saveEntry(CLIENT, WS, TPL, {
      glucose_fasting: 96,
      sleep_quality: 4,
      blood_pressure: '120/80',
      oil_bath: 'Yes',
    });
    const values = calls.find((c) => c.sql.includes('INSERT INTO public.daily_form_values'))!;
    const fieldIds = values.args.filter((a) => typeof a === 'string' && /^[a-z_]+$/.test(a));
    expect(fieldIds).toContain('glucose_fasting');
    expect(fieldIds).toContain('sleep_quality');
    expect(fieldIds).not.toContain('blood_pressure');
    expect(fieldIds).not.toContain('oil_bath');
  });

  it('stores the unit from the label, and none for a scale legend', async () => {
    const { svc, calls } = makeService();
    await svc.saveEntry(CLIENT, WS, TPL, { glucose_fasting: 96, sleep_quality: 4 });
    const values = calls.find((c) => c.sql.includes('INSERT INTO public.daily_form_values'))!;
    expect(values.args).toContain('mg/dL');
    // "(1 = poor, 5 = excellent)" is a legend, not a unit.
    expect(values.args.filter((a) => a === null).length).toBeGreaterThan(0);
  });

  it('accepts a number typed as text, as the phone keypad sends it', async () => {
    const { svc, calls } = makeService();
    await svc.saveEntry(CLIENT, WS, TPL, { glucose_fasting: '96' });
    const values = calls.find((c) => c.sql.includes('INSERT INTO public.daily_form_values'))!;
    expect(values.args).toContain(96);
  });

  it('skips a number that is not a number rather than writing NaN', async () => {
    const { svc, calls } = makeService();
    await svc.saveEntry(CLIENT, WS, TPL, { glucose_fasting: 'about ninety' });
    expect(calls.find((c) => c.sql.includes('INSERT INTO public.daily_form_values'))).toBeUndefined();
  });

  it('clears the day’s old values before writing, so a cleared field disappears', async () => {
    const { svc, calls } = makeService();
    await svc.saveEntry(CLIENT, WS, TPL, { glucose_fasting: 96 });
    const del = calls.findIndex((c) => c.sql.includes('DELETE FROM public.daily_form_values'));
    const ins = calls.findIndex((c) => c.sql.includes('INSERT INTO public.daily_form_values'));
    expect(del).toBeGreaterThan(-1);
    expect(del).toBeLessThan(ins);
  });

  it('rejects responses that are not an object', async () => {
    const { svc } = makeService();
    await expect(svc.saveEntry(CLIENT, WS, TPL, [] as unknown as Record<string, unknown>)).rejects.toThrow();
  });
});
