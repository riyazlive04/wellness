/**
 * Module 6 — AI wellness assistant. Ported subset of the web assistant API
 * (frontend/src/modules/assistant/api.ts). The backend resolves which assistant
 * the caller gets (wellness, for clients) from their identity.
 */
import { api } from '@/lib/api';

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

export interface Conversation {
  id: string;
  assistant_type: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
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

const BASE = '/api/v1/assistants/me';

export const assistantApi = {
  me: () => api.get<AssistantProfile>(BASE),
  listConversations: () => api.get<Conversation[]>(`${BASE}/conversations`),
  createConversation: (title?: string) =>
    api.post<Conversation>(`${BASE}/conversations`, { body: title ? { title } : {} }),
  getConversation: (id: string) =>
    api.get<{ conversation: Conversation; messages: AssistantMessage[] }>(`${BASE}/conversations/${id}`),
  sendMessage: (id: string, text: string) =>
    api.post<AssistantMessage>(`${BASE}/conversations/${id}/messages`, { body: { text } }),
};
