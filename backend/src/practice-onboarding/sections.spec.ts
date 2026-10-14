import { cleanSection, emptySections, hasAnyValue } from './sections';

/** What counts as a completed onboarding section. */
describe('practice onboarding sections', () => {
  it('account needs name, a real email and a phone number', () => {
    expect(cleanSection('account', { name: 'Priya Raman', email: 'Priya@Clinic.in ', phone: '98765 43210' }).missing).toEqual([]);
    expect(cleanSection('account', { name: 'Priya Raman', email: 'priya@clinic.in', phone: '98765 43210' }).data.phone).toBe('9876543210');
    expect(cleanSection('account', { name: 'P', email: 'nope', phone: '123' }).missing).toEqual(['Full name', 'Email', 'Phone']);
  });

  it('practice needs name, city, state, experience and a speciality', () => {
    const ok = cleanSection('practice', { practice_name: 'Priya Nutrition Clinic', city: 'Chennai', state: 'Tamil Nadu', experience_years: '8', specializations: ['Diabetes'] });
    expect(ok.missing).toEqual([]);
    expect(ok.data.experience_years).toBe(8);
    expect(cleanSection('practice', { practice_name: 'Priya Nutrition Clinic' }).missing).toContain('At least one speciality');
  });

  it('meal times keep only known slots, once each', () => {
    const { data, missing } = cleanSection('meals', { slots: [{ slot: 'breakfast' }, { slot: 'brunch' }, { slot: 'breakfast', label: 'x' }, { slot: 'dinner', label: 'Last Meal' }] });
    expect(missing).toEqual([]);
    expect(data.slots).toEqual([{ slot: 'breakfast', label: '' }, { slot: 'dinner', label: 'Last Meal' }]);
    expect(cleanSection('meals', { slots: [] }).missing).toEqual(['At least one meal time']);
  });

  it('billing checks PAN, and GSTIN only when given', () => {
    expect(cleanSection('billing', { pan: 'abcpr1234k', address: '12 Anna Nagar, Chennai' }).missing).toEqual([]);
    expect(cleanSection('billing', { pan: 'ABCPR1234K', gstin: 'WRONG', address: '12 Anna Nagar, Chennai' }).missing).toEqual(['GSTIN in the right format']);
    expect(cleanSection('billing', { pan: '1234', address: '' }).missing).toEqual(['PAN (e.g. ABCDE1234F)', 'Billing address']);
  });

  it('clients keeps only rows with an email and needs the current count', () => {
    const { data, missing } = cleanSection('clients', { client_count: '40', rows: [{ name: 'Asha', email: 'asha@x.in' }, { name: 'No email' }] });
    expect(missing).toEqual([]);
    expect((data.rows as unknown[]).length).toBe(1);
  });

  it('an untouched section is not started; typing anything starts it', () => {
    expect(hasAnyValue({ tagline: '', logo: null })).toBe(false);
    expect(hasAnyValue({ tagline: 'Eat well' })).toBe(true);
    expect(Object.keys(emptySections())).toEqual(['account', 'practice', 'branding', 'meals', 'clients', 'billing']);
  });
});
