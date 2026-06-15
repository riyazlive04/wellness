import { api } from '@/lib/api';

/** Module 10 — workspace Reports & Analytics. */

export interface OverviewKpis {
  total_clients: number; active_clients: number; new_clients_month: number; active_7d: number;
  active_programs: number; avg_program_progress: number; ai_calls_month: number; messages_7d: number; mrr_inr: number;
}
export interface GrowthPoint { month: string; count: number }
export interface EngagementPoint { day: string; active: number }
export interface NutritionTrends { protein_g: number; carb_g: number; fat_g: number; avg_daily_kcal: number; meal_count: number }
export interface ProgramPerformance { by_status: Array<{ status: string; count: number; avg_progress: number }> }
export interface AiUsage { daily: Array<{ day: string; calls: number }>; by_service: Array<{ service: string; calls: number }> }

const BASE = '/api/v1/workspaces/me/analytics';

export const analyticsApi = {
  overview: () => api.get<OverviewKpis>(`${BASE}/overview`),
  clientGrowth: (months = 6) => api.get<GrowthPoint[]>(`${BASE}/client-growth?months=${months}`),
  engagement: (days = 30) => api.get<EngagementPoint[]>(`${BASE}/engagement?days=${days}`),
  nutritionTrends: (days = 30) => api.get<NutritionTrends>(`${BASE}/nutrition-trends?days=${days}`),
  programPerformance: () => api.get<ProgramPerformance>(`${BASE}/program-performance`),
  aiUsage: (days = 14) => api.get<AiUsage>(`${BASE}/ai-usage?days=${days}`),
  insights: () => api.get<{ insights: string }>(`${BASE}/insights`),
};
