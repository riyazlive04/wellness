import { api } from '@/lib/api';

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
  standard: string;
  engine_version: string;
}

export interface MeasurementRow {
  id: string;
  recorded_at: string;
  weight_kg: number | null;
  arm_inches: number | null;
  chest_inches: number | null;
  waist_inches: number | null;
  hip_inches: number | null;
  thigh_inches: number | null;
  notes: string | null;
}

export interface Assessment {
  profile: { age: number | null; gender: string | null; height_cm: number | null; weight_kg: number | null; activity_level: string | null };
  latest_measurement: MeasurementRow | null;
  metrics: AnthroMetrics;
}

export interface RecordMeasurementInput {
  weight_kg?: number;
  arm_inches?: number;
  chest_inches?: number;
  waist_inches?: number;
  hip_inches?: number;
  thigh_inches?: number;
  notes?: string;
}

const BASE = '/api/v1/me/assessment';

export const assessmentApi = {
  mine: () => api.get<Assessment>(BASE),
  listMeasurements: (limit = 30) => api.get<MeasurementRow[]>(`${BASE}/measurements?limit=${limit}`),
  record: (body: RecordMeasurementInput) => api.post<Assessment>(`${BASE}/measurements`, { body }),
};

// Owner / nutritionist view of a specific client.
export const clientAssessmentApi = {
  get: (clientId: string) => api.get<Assessment>(`/api/v1/workspaces/me/clients/${clientId}/assessment`),
  listMeasurements: (clientId: string, limit = 30) =>
    api.get<MeasurementRow[]>(`/api/v1/workspaces/me/clients/${clientId}/assessment/measurements?limit=${limit}`),
  record: (clientId: string, body: RecordMeasurementInput) =>
    api.post<Assessment>(`/api/v1/workspaces/me/clients/${clientId}/assessment/measurements`, { body }),
};
