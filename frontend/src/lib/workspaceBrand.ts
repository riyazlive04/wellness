import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/modules/workspace/api/workspaces';

/**
 * Workspace brand (name + logo + palette + tagline) shared across the shell.
 *
 * Server-backed: the source of truth is the `workspaces` row (logo_url,
 * brand_color, brand_accent, tagline). localStorage acts as a fast,
 * synchronous cache so `getWorkspaceBrand()` stays sync and every consumer
 * (topbar badge, sidebar avatar, client portal) reads without a loading state.
 *
 * Flow:
 *   - `useServerBrandingSync()` (mounted in the shells) fetches the row and
 *     writes it into the cache, broadcasting `sirah:brand-change`.
 *   - Owner writes (`setWorkspaceLogo` / `setWorkspaceBranding`) update the
 *     cache + broadcast immediately (optimistic), then PATCH the server so
 *     every device and every client of the workspace sees it.
 */
const KEY = 'sirah:workspace:draft';
const EVENT = 'sirah:brand-change';

export interface BrandPalette {
  id: string;
  primary: string;
  accent: string;
}

/** Falls back to the SIRAH LIFE default palette + tagline. */
export const DEFAULT_PALETTE: BrandPalette = { id: 'default', primary: '#7DBE9D', accent: '#8087FF' };
export const DEFAULT_TAGLINE = 'Wellness, intelligently delivered.';

export interface WorkspaceBrand {
  practiceName: string;
  logoUrl: string | null;
  palette: BrandPalette;
  tagline: string;
}

export function getWorkspaceBrand(): WorkspaceBrand {
  let practiceName = 'Your Practice';
  let logoUrl: string | null = null;
  let palette: BrandPalette = DEFAULT_PALETTE;
  let tagline = DEFAULT_TAGLINE;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (typeof d?.practiceName === 'string' && d.practiceName.trim()) practiceName = d.practiceName;
      if (typeof d?.logoUrl === 'string' && d.logoUrl) logoUrl = d.logoUrl;
      if (d?.palette && typeof d.palette.primary === 'string' && typeof d.palette.accent === 'string') {
        palette = { id: String(d.palette.id ?? 'custom'), primary: d.palette.primary, accent: d.palette.accent };
      }
      if (typeof d?.tagline === 'string') tagline = d.tagline;
    }
  } catch { /* ignore */ }
  return { practiceName, logoUrl, palette, tagline };
}

/** Persist palette and/or tagline; updates cache, broadcasts, write-through to server. */
export function setWorkspaceBranding(patch: { palette?: BrandPalette; tagline?: string }): void {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? JSON.parse(raw) : {};
    if (patch.palette) d.palette = patch.palette;
    if (patch.tagline !== undefined) d.tagline = patch.tagline;
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
  // Write-through to the server (owner-only there; non-owners stay local-only).
  void workspacesApi
    .updateBranding({
      ...(patch.palette ? { brand_color: patch.palette.primary, brand_accent: patch.palette.accent } : {}),
      ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
    })
    .catch(() => { /* offline / not owner — cache already updated */ });
}

/** Persist (or clear, with null) the workspace logo; cache + broadcast + server. */
export function setWorkspaceLogo(logoUrl: string | null): void {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? JSON.parse(raw) : {};
    if (logoUrl) d.logoUrl = logoUrl;
    else delete d.logoUrl;
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
  // '' clears the column server-side.
  void workspacesApi.updateBranding({ logo_url: logoUrl ?? '' }).catch(() => { /* local-only */ });
}

/** Reactive brand — re-reads on logo changes (this tab) and storage (others). */
export function useWorkspaceBrand(): WorkspaceBrand {
  const [brand, setBrand] = useState<WorkspaceBrand>(() => getWorkspaceBrand());
  useEffect(() => {
    const refresh = () => setBrand(getWorkspaceBrand());
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return brand;
}

/**
 * Pull the server's branding into the local cache once per session. Mount this
 * high in each shell (owner + client portal) so the practice's logo / palette /
 * tagline appear for every member on every device. Writes only when something
 * actually changed, then broadcasts so live components re-theme.
 */
export function useServerBrandingSync(): void {
  const { data } = useQuery({
    queryKey: ['workspace', 'branding'],
    queryFn: () => workspacesApi.branding(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  useEffect(() => {
    if (!data) return;
    try {
      const raw = localStorage.getItem(KEY);
      const d = raw ? JSON.parse(raw) : {};
      let changed = false;
      if (data.name && d.practiceName !== data.name) { d.practiceName = data.name; changed = true; }
      const logo = data.logo_url || null;
      if ((d.logoUrl ?? null) !== logo) { if (logo) d.logoUrl = logo; else delete d.logoUrl; changed = true; }
      const primary = data.brand_color || DEFAULT_PALETTE.primary;
      const accent = data.brand_accent || DEFAULT_PALETTE.accent;
      if (!d.palette || d.palette.primary !== primary || d.palette.accent !== accent) {
        d.palette = { id: 'server', primary, accent };
        changed = true;
      }
      const tagline = data.tagline ?? DEFAULT_TAGLINE;
      if (d.tagline !== tagline) { d.tagline = tagline; changed = true; }
      if (changed) {
        localStorage.setItem(KEY, JSON.stringify(d));
        window.dispatchEvent(new Event(EVENT));
      }
    } catch { /* ignore */ }
  }, [data]);
}

/**
 * Read an image File and return a data URL, downscaled so the longest edge is
 * `max` px (keeps localStorage small and matches the ~256px logo guidance).
 * SVGs are returned as-is (vector, already tiny).
 */
export async function fileToLogoDataUrl(file: File, max = 256): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml') return raw;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not decode the image.'));
    i.src = raw;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}
