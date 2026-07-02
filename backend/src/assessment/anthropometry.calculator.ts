import { Injectable } from '@nestjs/common';

/**
 * AnthropometryCalculator — pure, deterministic anthropometric math.
 *
 * Given a client's profile + latest circumference measurements, derive the
 * clinical metrics a nutritionist works from: BMI (Indian ICMR cut-offs), ideal
 * body-weight band, BMR (Mifflin-St Jeor), TDEE, waist-hip & waist-height ratios
 * and body-fat % (U.S. Navy). Every metric returns null when its inputs are
 * missing — we never invent numbers (same rule as the nutrition engine).
 */
export type Gender = 'male' | 'female' | 'other';

export interface AnthroInput {
  weight_kg: number | null;
  height_cm: number | null;
  age: number | null;
  gender: Gender | null;
  activity_level: string | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  neck_cm?: number | null;
}

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export interface AnthroMetrics {
  bmi: number | null;
  bmi_category: BmiCategory | null;
  ibw_target_kg: number | null;
  ibw_min_kg: number | null;
  ibw_max_kg: number | null;
  bmr_kcal: number | null;
  tdee_kcal: number | null;
  activity_factor: number | null;
  whr: number | null;
  whr_risk: boolean | null;
  waist_to_height: number | null;
  wth_risk: boolean | null;
  abdominal_obesity: boolean | null;
  body_fat_pct: number | null;
  standard: 'ICMR-India';
  engine_version: string;
}

const ENGINE_VERSION = '1.0.0';
const r = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;

@Injectable()
export class AnthropometryCalculator {
  compute(i: AnthroInput): AnthroMetrics {
    const hM = i.height_cm && i.height_cm > 0 ? i.height_cm / 100 : null;
    const w = i.weight_kg && i.weight_kg > 0 ? i.weight_kg : null;

    // ── BMI (Indian ICMR-NIN cut-offs) ──────────────────────────────
    const bmi = w && hM ? r(w / (hM * hM), 1) : null;
    const bmi_category: BmiCategory | null =
      bmi == null ? null : bmi < 18.5 ? 'underweight' : bmi < 23 ? 'normal' : bmi < 25 ? 'overweight' : 'obese';

    // ── Ideal body weight band (target BMI 22; healthy band 18.5–22.9) ─
    const ibw_target_kg = hM ? r(22 * hM * hM, 1) : null;
    const ibw_min_kg = hM ? r(18.5 * hM * hM, 1) : null;
    const ibw_max_kg = hM ? r(22.9 * hM * hM, 1) : null;

    // ── BMR (Mifflin-St Jeor) ───────────────────────────────────────
    let bmr_kcal: number | null = null;
    if (w && i.height_cm && i.age) {
      const genderConst = i.gender === 'male' ? 5 : i.gender === 'female' ? -161 : -78; // 'other'/null → midpoint
      bmr_kcal = r(10 * w + 6.25 * i.height_cm - 5 * i.age + genderConst, 0);
    }

    // ── TDEE = BMR × activity factor ────────────────────────────────
    const activity_factor = activityFactor(i.activity_level);
    const tdee_kcal = bmr_kcal != null ? r(bmr_kcal * activity_factor, 0) : null;

    // ── Waist-hip ratio ─────────────────────────────────────────────
    const whr = i.waist_cm && i.hip_cm ? r(i.waist_cm / i.hip_cm, 2) : null;
    const whr_risk =
      whr == null ? null : i.gender === 'female' ? whr > 0.85 : whr > 0.9;

    // ── Waist-to-height ratio (keep < 0.5) ──────────────────────────
    const waist_to_height = i.waist_cm && i.height_cm ? r(i.waist_cm / i.height_cm, 2) : null;
    const wth_risk = waist_to_height == null ? null : waist_to_height >= 0.5;

    // ── Abdominal obesity (India: M ≥90cm, F ≥80cm) ─────────────────
    const abdominal_obesity =
      i.waist_cm == null ? null : i.gender === 'female' ? i.waist_cm >= 80 : i.waist_cm >= 90;

    // ── Body fat % (U.S. Navy, metric) ──────────────────────────────
    const body_fat_pct = this.navyBodyFat(i);

    return {
      bmi, bmi_category,
      ibw_target_kg, ibw_min_kg, ibw_max_kg,
      bmr_kcal, tdee_kcal, activity_factor,
      whr, whr_risk,
      waist_to_height, wth_risk,
      abdominal_obesity,
      body_fat_pct,
      standard: 'ICMR-India',
      engine_version: ENGINE_VERSION,
    };
  }

  private navyBodyFat(i: AnthroInput): number | null {
    if (!i.height_cm || !i.neck_cm || !i.waist_cm) return null;
    const log10 = (x: number) => Math.log10(x);
    if (i.gender === 'female') {
      if (!i.hip_cm) return null;
      const denom = 1.29579 - 0.35004 * log10(i.waist_cm + i.hip_cm - i.neck_cm) + 0.221 * log10(i.height_cm);
      if (!(i.waist_cm + i.hip_cm - i.neck_cm > 0) || denom <= 0) return null;
      return clampBf(r(495 / denom - 450, 1));
    }
    // male / other
    if (!(i.waist_cm - i.neck_cm > 0)) return null;
    const denom = 1.0324 - 0.19077 * log10(i.waist_cm - i.neck_cm) + 0.15456 * log10(i.height_cm);
    if (denom <= 0) return null;
    return clampBf(r(495 / denom - 450, 1));
  }
}

/** Map a free-text activity level to a TDEE multiplier; default lightly-active. */
function activityFactor(level: string | null): number {
  if (!level) return 1.375;
  const l = level.toLowerCase();
  if (/sedentary|inactive|desk|none/.test(l)) return 1.2;
  if (/athlete|extra|intense|twice|very ?active|6-7/.test(l)) return 1.9;
  if (/very|active|6-7/.test(l)) return 1.725;
  if (/moderate|3-5/.test(l)) return 1.55;
  if (/light|1-3/.test(l)) return 1.375;
  return 1.375;
}

function clampBf(n: number): number | null {
  return n >= 2 && n <= 70 ? n : null; // implausible → treat as unmeasurable
}
