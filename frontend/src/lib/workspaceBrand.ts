import { useEffect, useState } from 'react';

/**
 * Workspace brand (name + logo) shared across the owner shell.
 *
 * The app derives workspace identity from the onboarding draft persisted in
 * localStorage (`sirah:workspace:draft`). The logo lives alongside it as a
 * data URL so it survives reloads and shows everywhere the practice identity
 * appears (settings, the topbar "My Practice" badge) without threading props
 * through every page. Writes broadcast a `sirah:brand-change` event so open
 * components update live in the same tab.
 *
 * NOTE: this is client-side persistence (same as the rest of the mock
 * settings). Wiring it to a real `workspaces.logo_url` + storage upload is a
 * follow-up; the contract here (getWorkspaceBrand / useWorkspaceBrand) won't
 * change when that lands.
 */
const KEY = 'sirah:workspace:draft';
const EVENT = 'sirah:brand-change';

export interface WorkspaceBrand {
  practiceName: string;
  logoUrl: string | null;
}

export function getWorkspaceBrand(): WorkspaceBrand {
  let practiceName = 'Your Practice';
  let logoUrl: string | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (typeof d?.practiceName === 'string' && d.practiceName.trim()) practiceName = d.practiceName;
      if (typeof d?.logoUrl === 'string' && d.logoUrl) logoUrl = d.logoUrl;
    }
  } catch { /* ignore */ }
  return { practiceName, logoUrl };
}

/** Persist (or clear, with null) the workspace logo and notify listeners. */
export function setWorkspaceLogo(logoUrl: string | null): void {
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? JSON.parse(raw) : {};
    if (logoUrl) d.logoUrl = logoUrl;
    else delete d.logoUrl;
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
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
