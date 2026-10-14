import { MEAL_SLOTS } from '../meal-plans/meal-plans.types';

/**
 * The six onboarding sections and what each needs to count as completed.
 * One source of truth: the API validates with this, the admin table and the
 * nutritionist's page show its result.
 */
export const SECTION_KEYS = ['account', 'practice', 'branding', 'meals', 'clients', 'billing'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type SectionStatus = 'none' | 'in_progress' | 'done';

export interface SectionState {
  status: SectionStatus;
  data: Record<string, unknown>;
  updated_at?: string;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, max = 20): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, 60)).filter(Boolean).slice(0, max) : [];

/**
 * Tidy what the page sent for one section (never trust the browser) and list
 * what's still missing for it to be complete. The account password is handled
 * separately and never stored here.
 */
export function cleanSection(key: SectionKey, raw: Record<string, unknown>): { data: Record<string, unknown>; missing: string[] } {
  const missing: string[] = [];
  const need = (ok: boolean, label: string) => { if (!ok) missing.push(label); };

  switch (key) {
    case 'account': {
      const data = { name: str(raw.name, 120), email: str(raw.email, 160).toLowerCase(), phone: str(raw.phone, 20).replace(/[^\d+]/g, '') };
      need(data.name.length >= 2, 'Full name');
      need(EMAIL_RE.test(data.email), 'Email');
      need(/^\+?\d{10,13}$/.test(data.phone), 'Phone');
      return { data, missing };
    }
    case 'practice': {
      const years = Number(raw.experience_years);
      const data = {
        practice_name: str(raw.practice_name, 120),
        city: str(raw.city, 80),
        state: str(raw.state, 80),
        experience_years: Number.isFinite(years) && years >= 0 && years <= 70 ? Math.round(years) : null,
        specializations: strList(raw.specializations),
      };
      need(data.practice_name.length >= 2, 'Practice name');
      need(!!data.city, 'City');
      need(!!data.state, 'State');
      need(data.experience_years !== null, 'Years of experience');
      need(data.specializations.length > 0, 'At least one speciality');
      return { data, missing };
    }
    case 'branding': {
      const logo = typeof raw.logo === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(raw.logo) && raw.logo.length <= 400_000 ? raw.logo : null;
      const data = { tagline: str(raw.tagline, 120), logo };
      need(!!data.tagline, 'Tagline');
      return { data, missing };
    }
    case 'meals': {
      const known = MEAL_SLOTS as readonly string[];
      const slots = (Array.isArray(raw.slots) ? raw.slots : [])
        .map((s) => (typeof s === 'object' && s ? (s as Record<string, unknown>) : {}))
        .map((s) => ({ slot: str(s.slot, 40), label: str(s.label, 40) }))
        .filter((s) => known.includes(s.slot))
        .filter((s, i, all) => all.findIndex((x) => x.slot === s.slot) === i);
      const data = { slots };
      need(slots.length > 0, 'At least one meal time');
      return { data, missing };
    }
    case 'clients': {
      const count = Number(raw.client_count);
      const rows = (Array.isArray(raw.rows) ? raw.rows : [])
        .map((r) => (typeof r === 'object' && r ? (r as Record<string, unknown>) : {}))
        .map((r) => ({ name: str(r.name, 120), email: str(r.email, 160).toLowerCase(), phone: str(r.phone, 20) }))
        .filter((r) => EMAIL_RE.test(r.email))
        .slice(0, 500);
      const data = { client_count: Number.isFinite(count) && count >= 0 && count <= 100_000 ? Math.round(count) : null, rows };
      need(data.client_count !== null, 'How many clients you have now');
      return { data, missing };
    }
    case 'billing': {
      const pan = str(raw.pan, 10).toUpperCase();
      const gstin = str(raw.gstin, 15).toUpperCase();
      const data = { pan, gstin, address: str(raw.address, 300) };
      need(PAN_RE.test(pan), 'PAN (e.g. ABCDE1234F)');
      if (gstin) need(GSTIN_RE.test(gstin), 'GSTIN in the right format');
      need(data.address.length >= 8, 'Billing address');
      return { data, missing };
    }
  }
}

/** Something typed counts as started; an untouched section stays "not started". */
export function hasAnyValue(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== '' && v !== undefined));
}

export function emptySections(): Record<SectionKey, SectionState> {
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, { status: 'none', data: {} }])) as Record<SectionKey, SectionState>;
}
