import { unitOf } from './daily-forms.service';

describe('unitOf', () => {
  it('reads the unit out of a label', () => {
    expect(unitOf('Fasting blood glucose (mg/dL)')).toBe('mg/dL');
    expect(unitOf('Total water you drank (litres)')).toBe('litres');
    expect(unitOf('Meditation or breathing practice (minutes)')).toBe('minutes');
  });

  it('ignores a scale legend, which is not a unit', () => {
    expect(unitOf('Sleep quality (1 = poor, 5 = excellent)')).toBeNull();
    expect(unitOf('Stress level today (1 = very calm, 10 = very stressed)')).toBeNull();
  });

  it('ignores a bracket that is an example rather than a unit', () => {
    // Commas mean prose, not a unit.
    expect(unitOf('Blood pressure (mmHg, e.g. 120/80)')).toBeNull();
  });

  it('returns null when there is no bracket', () => {
    expect(unitOf('Number of steps walked today')).toBeNull();
    expect(unitOf('')).toBeNull();
  });

  it('only reads a trailing bracket', () => {
    expect(unitOf('Steps (today) walked')).toBeNull();
  });
});
