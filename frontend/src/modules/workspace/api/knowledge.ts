import { api } from '@/lib/api';

/**
 * Knowledge base — documents the assistant answers from.
 * Mirrors backend/src/knowledge/knowledge.service.ts.
 */

export type KbScope = 'platform' | 'workspace';
export type KbStatus = 'pending' | 'indexing' | 'ready' | 'failed';

export interface KbDocument {
  id: string;
  scope: KbScope;
  workspace_id: string | null;
  title: string;
  source_name: string | null;
  status: KbStatus;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
}

export interface KbCitation {
  document_id: string;
  title: string;
  heading: string | null;
  chunk_index: number;
  /** Cosine similarity, 0..1. Higher means the passage is closer to the question. */
  similarity: number;
}

export interface KbAnswer {
  answer: string;
  citations: KbCitation[];
  /**
   * 'no_match' means nothing in the indexed documents was relevant — the
   * assistant declined rather than answering from general knowledge.
   */
  outcome: 'grounded' | 'no_match';
}

/** What the upload endpoint accepts. Text is extracted server-side before indexing. */
export const KB_ACCEPTED_EXTENSIONS = '.pdf,.docx,.md,.markdown,.txt,.csv,.json';

export const knowledgeApi = {
  list: () => api.get<KbDocument[]>('/api/v1/knowledge/documents'),

  upload: (file: File, title?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (title?.trim()) form.append('title', title.trim());
    return api.post<KbDocument>('/api/v1/knowledge/documents', { body: form });
  },

  remove: (id: string) => api.delete<{ deleted: true }>(`/api/v1/knowledge/documents/${id}`),

  ask: (question: string) =>
    api.post<KbAnswer>('/api/v1/knowledge/ask', { body: { question } }),
};
