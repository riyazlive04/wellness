import { api } from '@/lib/api';

/** The practice's switch for its clients' AI assistant. */
export interface ClientAssistantSettings {
  enabled: boolean;
  daily_limit: number;
}

/** One of a client's conversations with their AI assistant. */
export interface ClientAssistantConversation {
  id: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
  messages: Array<{ role: 'user' | 'assistant' | string; content: string; created_at: string }>;
}

export const clientAssistantApi = {
  get: () => api.get<ClientAssistantSettings>('/api/v1/workspaces/me/client-assistant'),
  update: (patch: Partial<ClientAssistantSettings>) =>
    api.put<ClientAssistantSettings>('/api/v1/workspaces/me/client-assistant', { body: patch }),
  conversations: (clientId: string) =>
    api.get<ClientAssistantConversation[]>(`/api/v1/workspaces/me/clients/${clientId}/assistant-conversations`),
};
