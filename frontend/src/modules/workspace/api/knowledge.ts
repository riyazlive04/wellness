import { api } from '@/lib/api';

/**
 * Knowledge base — the NUSI guide and each practice's own documents, searched
 * on the Help & guides page. Mirrors backend/src/knowledge/knowledge.service.ts.
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

/** One matching passage from a search, best match first. */
export interface KbPassage {
  document_id: string;
  title: string;
  heading: string | null;
  chunk_index: number;
  /** How closely it matches the search, 0..1. */
  similarity: number;
  content: string;
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

  search: (q: string) =>
    api.get<KbPassage[]>(`/api/v1/knowledge/search?q=${encodeURIComponent(q)}`),
};
