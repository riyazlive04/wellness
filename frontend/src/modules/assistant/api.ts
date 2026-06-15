import { api } from '@/lib/api';

/** Module 6 — AI Personal Assistant. The backend resolves which assistant the
 *  caller gets (executive / clinical / wellness) from their identity. */

export type AssistantType = 'executive' | 'clinical' | 'wellness';

export interface SuggestedAction {
  type: string;
  label: string;
  params?: Record<string, unknown>;
}

export interface ActionDef {
  type: string;
  label: string;
  description: string;
  mutating?: boolean;
}

export interface AssistantProfile {
  type: AssistantType;
  name: string;
  role: string;
  greeting: string;
  capabilities: string[];
  memoryScope: string;
  actions: ActionDef[];
  aiConfigured: boolean;
}

export interface MorningBrief {
  assistantType: AssistantType;
  headline: string;
  body: string;
  context: Record<string, unknown>;
  source: 'ai' | 'fallback';
}

export interface Conversation {
  id: string;
  user_id: string;
  workspace_id: string | null;
  assistant_type: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens: number | null;
  latency_ms: number | null;
  actions: SuggestedAction[];
  created_at: string;
}

export interface MemoryRow {
  id: string;
  scope: string;
  key: string;
  value: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface ActionResult {
  summary: string;
  result: unknown;
}

const BASE = '/api/v1/assistants/me';

export const assistantApi = {
  me: () => api.get<AssistantProfile>(BASE),
  brief: () => api.get<MorningBrief>(`${BASE}/brief`),

  listConversations: () => api.get<Conversation[]>(`${BASE}/conversations`),
  createConversation: (title?: string) =>
    api.post<Conversation>(`${BASE}/conversations`, { body: title ? { title } : {} }),
  getConversation: (id: string) =>
    api.get<{ conversation: Conversation; messages: AssistantMessage[] }>(`${BASE}/conversations/${id}`),
  deleteConversation: (id: string) =>
    api.delete<{ deleted: true }>(`${BASE}/conversations/${id}`),
  sendMessage: (id: string, text: string) =>
    api.post<AssistantMessage>(`${BASE}/conversations/${id}/messages`, { body: { text } }),

  listMemory: () => api.get<MemoryRow[]>(`${BASE}/memory`),
  remember: (key: string, value: string) =>
    api.post<MemoryRow>(`${BASE}/memory`, { body: { key, value } }),
  forget: (id: string) => api.delete<{ deleted: true }>(`${BASE}/memory/${id}`),

  runAction: (type: string, params?: Record<string, unknown>) =>
    api.post<ActionResult>(`${BASE}/actions/${type}`, { body: { params: params ?? {} } }),

  analytics: () =>
    api.get<{ assistant_type: AssistantType; conversations: number; messages: number; actions_run: number }>(`${BASE}/analytics`),
};
