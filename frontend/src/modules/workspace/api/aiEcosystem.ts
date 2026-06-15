import { api } from '@/lib/api';

/** Module 12 — Enterprise AI Ecosystem: recommendations, governance, feedback, analytics. */

export interface Recommendation {
  id: string; scope: string; type: string; title: string; body: string;
  severity: 'info' | 'opportunity' | 'risk'; source: string;
  status: 'new' | 'applied' | 'dismissed'; created_at: string;
}
export interface GovernanceAction {
  id: string; assistant_type: string | null; proposed_by: string; action_type: string;
  title: string; description: string | null; params: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  reviewed_by: string | null; reviewed_at: string | null; review_note: string | null;
  result: Record<string, unknown> | null; created_at: string;
}
export interface AiAnalytics {
  ai_calls_30d: number; ai_errors_30d: number; conversations: number; actions_run: number;
  recs_new: number; recs_applied: number; gov_pending: number; gov_approved: number;
  feedback_up: number; feedback_down: number; satisfaction: number;
}

const BASE = '/api/v1/workspaces/me/ai-ecosystem';

export const aiEcosystemApi = {
  listRecommendations: () => api.get<Recommendation[]>(`${BASE}/recommendations`),
  generate: () => api.post<Recommendation[]>(`${BASE}/recommendations/generate`),
  setRecStatus: (id: string, status: 'applied' | 'dismissed' | 'new') =>
    api.patch<Recommendation>(`${BASE}/recommendations/${id}`, { body: { status } }),
  listGovernance: (status?: string) =>
    api.get<GovernanceAction[]>(`${BASE}/governance${status ? `?status=${status}` : ''}`),
  reviewGovernance: (id: string, decision: 'approve' | 'reject', note?: string) =>
    api.post<GovernanceAction>(`${BASE}/governance/${id}/review`, { body: { decision, note } }),
  analytics: () => api.get<AiAnalytics>(`${BASE}/analytics`),
};

export const aiFeedbackApi = {
  send: (subjectType: 'message' | 'recommendation' | 'insight', rating: 'up' | 'down', subjectId?: string, note?: string) =>
    api.post<{ ok: true }>('/api/v1/me/ai/feedback', { body: { subjectType, rating, subjectId, note } }),
};
