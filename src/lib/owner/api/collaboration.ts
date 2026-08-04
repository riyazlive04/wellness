import { api } from '@/lib/api';

/** Module 9 — team collaboration: channels, team chat, shared notes, AI comms. */

export interface Channel {
  id: string; name: string; description: string | null; is_general: boolean;
  created_by: string | null; created_at: string; message_count?: number;
}
export interface TeamMessage {
  id: string; channel_id: string; sender_id: string | null; content: string;
  created_at: string; sender_email?: string | null; sender_role?: string | null;
}
export interface TeamNote {
  id: string; title: string | null; body: string; pinned: boolean;
  created_by: string | null; created_at: string; updated_at: string; author_email?: string | null;
}

const BASE = '/api/v1/workspaces/me/collaboration';

export const collaborationApi = {
  listChannels: () => api.get<Channel[]>(`${BASE}/channels`),
  createChannel: (name: string, description?: string) =>
    api.post<Channel>(`${BASE}/channels`, { body: { name, description } }),
  deleteChannel: (id: string) => api.delete<{ deleted: true }>(`${BASE}/channels/${id}`),

  listMessages: (channelId: string) => api.get<TeamMessage[]>(`${BASE}/channels/${channelId}/messages`),
  sendMessage: (channelId: string, content: string) =>
    api.post<TeamMessage>(`${BASE}/channels/${channelId}/messages`, { body: { content } }),

  listNotes: () => api.get<TeamNote[]>(`${BASE}/notes`),
  createNote: (body: string, title?: string) => api.post<TeamNote>(`${BASE}/notes`, { body: { body, title } }),
  updateNote: (id: string, patch: { title?: string; body?: string; pinned?: boolean }) =>
    api.patch<TeamNote>(`${BASE}/notes/${id}`, { body: patch }),
  deleteNote: (id: string) => api.delete<{ deleted: true }>(`${BASE}/notes/${id}`),

  summary: (clientId: string) => api.get<{ summary: string }>(`${BASE}/clients/${clientId}/summary`),
  smartReplies: (clientId: string) => api.get<{ replies: string[] }>(`${BASE}/clients/${clientId}/smart-replies`),
};
