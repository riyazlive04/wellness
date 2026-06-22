import { api } from '@/lib/api';

export type SearchResultType = 'client' | 'program' | 'recipe';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  sublabel: string | null;
  url: string;
}

export const searchApi = {
  query: (q: string) => api.get<SearchResult[]>(`/api/v1/search?q=${encodeURIComponent(q)}`),
};

/** Fire this event (anywhere) to open the global command palette. */
export const OPEN_SEARCH_EVENT = 'sirah:open-search';
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}
