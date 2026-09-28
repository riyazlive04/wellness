import { toast } from 'sonner';

import { api, ApiError } from '@/lib/api';

export type AiProvider = 'gemini' | 'openai';

/** The practice's AI key as the backend shows it — never the key itself. */
export interface AiKeyView {
  provider: AiProvider | null;
  last4: string | null;
  status: 'connected' | 'error' | 'missing';
  last_error: string | null;
  last_tested_at: string | null;
}

export const aiKeyApi = {
  get: () => api.get<AiKeyView>('/api/v1/workspaces/me/ai-key'),
  save: (provider: AiProvider, key: string) =>
    api.put<AiKeyView>('/api/v1/workspaces/me/ai-key', { body: { provider, key } }),
  test: () => api.post<AiKeyView>('/api/v1/workspaces/me/ai-key/test'),
  remove: () => api.delete<{ removed: boolean }>('/api/v1/workspaces/me/ai-key'),
};

/** True when an AI call failed because the practice hasn't added its own key. */
export function isAiKeyMissing(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'ai_key_missing';
}

/**
 * Shows an AI error. When the practice has no key yet, the toast carries a
 * button straight to Settings -> AI. Returns false for any other error so the
 * caller can show its own message.
 */
export function toastAiKeyMissing(err: unknown): boolean {
  if (!isAiKeyMissing(err)) return false;
  toast.error('AI is off for your practice', {
    description: 'Add your Google Gemini or OpenAI key to turn on AI features.',
    action: { label: 'Open AI settings', onClick: () => { window.location.href = '/settings?tab=ai'; } },
    duration: 10_000,
  });
  return true;
}
