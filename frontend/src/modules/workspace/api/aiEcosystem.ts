import { api } from '@/lib/api';

/**
 * AI Assistant feedback signal (thumbs up/down in AssistantChat). The former
 * Enterprise AI Ecosystem surface (recommendations + governance queue) was
 * removed from the dashboard; only this learning signal remains.
 */
export const aiFeedbackApi = {
  send: (subjectType: 'message' | 'recommendation' | 'insight', rating: 'up' | 'down', subjectId?: string, note?: string) =>
    api.post<{ ok: true }>('/api/v1/me/ai/feedback', { body: { subjectType, rating, subjectId, note } }),
};
