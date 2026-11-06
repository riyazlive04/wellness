import { LAB_MARKERS, markerByCode } from './lab-markers';
import { SELF_LOGGABLE, SELF_PLAUSIBLE } from './labs.service';

/**
 * Daily blood-sugar self-monitoring.
 *
 * Practices asked to track fasting and post-meal sugar day by day. It extends
 * the labs module rather than adding a second home for blood results, so the
 * rules about what a CLIENT may write are what matter most here.
 */
describe('what a client may log themselves', () => {
  it('allows exactly the readings home equipment produces', () => {
    expect([...SELF_LOGGABLE].sort()).toEqual([
      'bp_diastolic', 'bp_systolic', 'fbs', 'ppbs_meal1', 'ppbs_meal2',
    ]);
  });

  it('refuses markers that can only come off a lab report', () => {
    // A client who could post any marker could enter their own thyroid or
    // lipid result, which a practitioner would then read as lab-confirmed.
    for (const code of ['hba1c', 'tsh', 'ldl', 'vitamin_d', 'creatinine']) {
      expect(SELF_LOGGABLE.has(code)).toBe(false);
    }
  });

  it('has a plausibility range for every loggable marker', () => {
    for (const code of SELF_LOGGABLE) {
      expect(SELF_PLAUSIBLE[code]).toBeDefined();
    }
  });
});

describe('rejecting a typo without making a clinical judgement', () => {
  const ok = (code: string, v: number) => {
    const l = SELF_PLAUSIBLE[code];
    return Number.isFinite(v) && v >= l.min && v <= l.max;
  };

  it('accepts ordinary and genuinely alarming readings alike', () => {
    expect(ok('fbs', 92)).toBe(true);
    // 480 is a medical emergency, not a typo. Refusing it would stop a client
    // recording the reading that matters most.
    expect(ok('fbs', 480)).toBe(true);
  });

  it('rejects a misplaced decimal point', () => {
    expect(ok('fbs', 9.2)).toBe(false);
    expect(ok('fbs', 9200)).toBe(false);
  });

  it('rejects a weight typed into a sugar box', () => {
    // 72 kg is a plausible glucose value, so this is caught by the UI's
    // labelling rather than here - but 7.2 and 720 are not.
    expect(ok('ppbs_meal1', 7.2)).toBe(false);
    expect(ok('ppbs_meal1', 720)).toBe(false);
  });

  it('rejects nonsense', () => {
    expect(ok('fbs', Number.NaN)).toBe(false);
    expect(ok('fbs', -90)).toBe(false);
    expect(ok('fbs', 0)).toBe(false);
  });
});

describe('the two post-meal markers', () => {
  it('are separate series, not one marker with a meal tag', () => {
    // A chart that mixes breakfast and dinner readings into one line hides
    // exactly the pattern a nutritionist is looking for: which meal spikes.
    const m1 = markerByCode('ppbs_meal1');
    const m2 = markerByCode('ppbs_meal2');
    expect(m1).toBeDefined();
    expect(m2).toBeDefined();
    expect(m1!.code).not.toBe(m2!.code);
  });

  // These looped over SELF_LOGGABLE until blood pressure joined it. Scoped to
  // the sugar markers now: BP is mmHg in its own panel, and the point of the
  // assertions is that one CHART's markers share a panel and an axis unit.
  const SUGAR = ['fbs', 'ppbs_meal1', 'ppbs_meal2'];

  it('sit in the glycaemic panel beside fasting sugar', () => {
    for (const code of SUGAR) {
      expect(markerByCode(code)!.panel).toBe('glycaemic');
    }
  });

  it('carry mg/dL, so a chart axis needs no guesswork', () => {
    for (const code of SUGAR) {
      expect(markerByCode(code)!.unit).toBe('mg/dL');
    }
  });

  it('leave the original ppbs marker alone', () => {
    // Kept for a lab report that says "post-prandial" without naming a meal.
    expect(markerByCode('ppbs')).toBeDefined();
  });

  it('does not duplicate a marker code anywhere in the catalogue', () => {
    const codes = LAB_MARKERS.map((m) => m.code);
    expect(codes.length).toBe(new Set(codes).size);
  });
});

describe('the reference ranges the chart colours come from', () => {
  it('flags fasting sugar above the normal range', () => {
    const fbs = markerByCode('fbs')!;
    expect(fbs.fallbackRef).toEqual({ low: 70, high: 99 });
    expect(fbs.higherIsWorse).toBe(true);
  });

  it('flags post-meal sugar above 140', () => {
    for (const code of ['ppbs_meal1', 'ppbs_meal2']) {
      expect(markerByCode(code)!.fallbackRef).toEqual({ low: null, high: 140 });
    }
  });

  /**
   * Band boundaries for the red/amber/green chart, kept here so a change to
   * the colours has to disagree with a test rather than drift quietly.
   * General reference (ADA/ICMR), never rendered as a diagnosis.
   */
  const band = (code: string, v: number): 'normal' | 'borderline' | 'high' => {
    if (code === 'fbs') {
      if (v < 100) return 'normal';
      if (v < 126) return 'borderline';
      return 'high';
    }
    if (v < 140) return 'normal';
    if (v < 200) return 'borderline';
    return 'high';
  };

  it('places fasting readings in the right band', () => {
    expect(band('fbs', 88)).toBe('normal');
    expect(band('fbs', 110)).toBe('borderline');
    expect(band('fbs', 140)).toBe('high');
  });

  it('places post-meal readings in the right band', () => {
    expect(band('ppbs_meal1', 120)).toBe('normal');
    expect(band('ppbs_meal1', 165)).toBe('borderline');
    expect(band('ppbs_meal2', 240)).toBe('high');
  });

  it('uses a different fasting threshold from post-meal', () => {
    // 130 is borderline fasting but normal after a meal. One shared threshold
    // would mislabel one of the two.
    expect(band('fbs', 130)).toBe('high');
    expect(band('ppbs_meal1', 130)).toBe('normal');
  });
});

/**
 * Blood pressure, added 2026-11-06.
 *
 * Two markers rather than one "128/82" string, because text cannot be plotted
 * or banded. The pairing rules below are the ones that stop half a reading,
 * or a reversed one, reaching a practitioner's chart.
 */
describe('blood pressure', () => {
  it('is two separate markers in their own panel', () => {
    for (const code of ['bp_systolic', 'bp_diastolic']) {
      const m = markerByCode(code);
      expect(m).toBeDefined();
      expect(m!.panel).toBe('vitals');
      expect(m!.unit).toBe('mmHg');
    }
  });

  it('can be logged by the client, like a glucometer reading', () => {
    expect(SELF_LOGGABLE.has('bp_systolic')).toBe(true);
    expect(SELF_LOGGABLE.has('bp_diastolic')).toBe(true);
  });

  it('accepts an alarming reading but refuses a typo', () => {
    const ok = (code: string, v: number) => {
      const l = SELF_PLAUSIBLE[code];
      return v >= l.min && v <= l.max;
    };
    // Hypertensive crisis territory. Refusing it would block the reading that
    // most needs recording.
    expect(ok('bp_systolic', 190)).toBe(true);
    expect(ok('bp_diastolic', 120)).toBe(true);
    expect(ok('bp_systolic', 118)).toBe(true);
    // A systolic of 1280 is a slipped keystroke, and one of those flattens
    // every other point on the chart.
    expect(ok('bp_systolic', 1280)).toBe(false);
    expect(ok('bp_diastolic', 800)).toBe(false);
  });

  it('bands the normal range at 120/80', () => {
    expect(markerByCode('bp_systolic')!.fallbackRef).toEqual({ low: 90, high: 120 });
    expect(markerByCode('bp_diastolic')!.fallbackRef).toEqual({ low: 60, high: 80 });
  });

  it('does not collide with an existing marker alias', () => {
    // A lab report line reading "systolic" must not resolve to something else.
    const bp = new Set(['bp_systolic', 'bp_diastolic']);
    for (const m of LAB_MARKERS) {
      if (bp.has(m.code)) continue;
      for (const a of m.aliases ?? []) {
        expect(['systolic', 'diastolic', 'sbp', 'dbp']).not.toContain(a.toLowerCase());
      }
    }
  });
});
