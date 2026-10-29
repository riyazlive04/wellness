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
  it('allows exactly the readings a home glucometer produces', () => {
    expect([...SELF_LOGGABLE].sort()).toEqual(['fbs', 'ppbs_meal1', 'ppbs_meal2']);
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

  it('sit in the glycaemic panel beside fasting sugar', () => {
    for (const code of SELF_LOGGABLE) {
      expect(markerByCode(code)!.panel).toBe('glycaemic');
    }
  });

  it('carry mg/dL, so a chart axis needs no guesswork', () => {
    for (const code of SELF_LOGGABLE) {
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
