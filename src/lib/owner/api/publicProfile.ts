import { api } from '@/lib/api';

export type ProfileLinkIcon = 'whatsapp' | 'instagram' | 'youtube' | 'website' | 'calendar' | 'shop' | 'custom';

export interface PublicProfileLink {
  id?: string;
  label: string;
  url: string;
  icon: ProfileLinkIcon;
  sort_order?: number;
  enabled?: boolean;
}

export interface PublicProfileView {
  slug: string;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  brand_accent: string | null;
  tagline: string | null;
  headline: string | null;
  bio: string | null;
  verified: boolean;
  show_join_cta: boolean;
  join_url: string | null;
  links: PublicProfileLink[];
}

export interface OwnerPublicProfile {
  enabled: boolean;
  headline: string | null;
  bio: string | null;
  show_join_cta: boolean;
  slug: string | null;
  public_url: string | null;
  links: Array<PublicProfileLink & { id: string; enabled: boolean; sort_order: number }>;
}

export const publicProfileApi = {
  bySlug: (slug: string) =>
    api.get<PublicProfileView>(`/api/v1/public/profiles/${encodeURIComponent(slug)}`, { skipAuth: true }),

  getMine: () => api.get<OwnerPublicProfile | null>('/api/v1/workspaces/me/public-profile'),

  patchMine: (body: {
    enabled?: boolean;
    headline?: string | null;
    bio?: string | null;
    show_join_cta?: boolean;
  }) => api.patch<OwnerPublicProfile>('/api/v1/workspaces/me/public-profile', { body }),

  replaceLinks: (links: Array<{ label: string; url: string; icon?: ProfileLinkIcon; enabled?: boolean }>) =>
    api.put<OwnerPublicProfile>('/api/v1/workspaces/me/public-profile/links', { body: { links } }),
};
