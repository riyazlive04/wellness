/**
 * Practice branding for the native app.
 *
 * A workspace on a white-label plan (or with the white-label add-on) ships the
 * app as *their* product: their name, their logo, their palette. Everyone else
 * stays on SIRAH LIFE branding with their palette used only for accents, which
 * is how the client portal has always behaved.
 *
 * Two design points that matter more on native than on web:
 *
 *  1. The resolved brand is cached in AsyncStorage and read back synchronously
 *     on the next launch, so a white-labelled app opens already wearing its own
 *     identity. Without the cache every cold start would flash SIRAH branding
 *     for the length of a network round-trip — on a white-label build that
 *     flash is the whole product promise breaking in front of the user.
 *
 *  2. `whiteLabel` is decided by the SERVER (plan + add-on) and only consumed
 *     here. The app never re-derives an entitlement it cannot verify.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { clientsApi } from '@/lib/clients-api';

const STORAGE_KEY = 'sirah-practice-brand';

export interface PracticeBrand {
  /** Practice name. Only used as the app's own identity when whiteLabel. */
  name: string | null;
  logoUrl: string | null;
  tagline: string | null;
  /** Primary brand colour, or null to keep the SIRAH default. */
  primary: string | null;
  accent: string | null;
  /** Server-resolved: may this practice replace our branding entirely? */
  whiteLabel: boolean;
}

export const EMPTY_BRAND: PracticeBrand = {
  name: null, logoUrl: null, tagline: null, primary: null, accent: null, whiteLabel: false,
};

const BrandContext = createContext<PracticeBrand>(EMPTY_BRAND);

/** #RGB or #RRGGBB only — anything else is ignored rather than fed to the themer. */
function safeColor(value: unknown): string | null {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : null;
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [cached, setCached] = useState<PracticeBrand | null>(null);

  // Paint from the last known brand immediately, before the network answers.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<PracticeBrand>;
        setCached({
          name: parsed.name ?? null,
          logoUrl: parsed.logoUrl ?? null,
          tagline: parsed.tagline ?? null,
          primary: safeColor(parsed.primary),
          accent: safeColor(parsed.accent),
          whiteLabel: !!parsed.whiteLabel,
        });
      })
      .catch(() => {});
  }, []);

  const brandQ = useQuery({
    queryKey: ['me', 'nutritionist'],
    queryFn: () => clientsApi.myNutritionist(),
    enabled: !!session,
    staleTime: 300_000,
    retry: 1,
  });

  const brand = useMemo<PracticeBrand>(() => {
    const d = brandQ.data;
    if (!d) return cached ?? EMPTY_BRAND;
    return {
      name: d.name ?? null,
      logoUrl: d.logo_url ?? null,
      tagline: d.tagline ?? null,
      primary: safeColor(d.brand_color),
      accent: safeColor(d.brand_accent),
      whiteLabel: !!d.white_label,
    };
  }, [brandQ.data, cached]);

  // Persist only server truth. Writing the cached value back would keep a stale
  // brand alive forever once a practice turns white-label off.
  useEffect(() => {
    if (!brandQ.data) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(brand)).catch(() => {});
  }, [brandQ.data, brand]);

  // Signing out must drop the previous practice's identity — the next account
  // on this device may belong to a different (or no) white-label practice.
  useEffect(() => {
    if (session) return;
    setCached(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, [session]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

/** The client's practice brand. Always defined; unbranded practices return nulls. */
export function useBrand(): PracticeBrand {
  return useContext(BrandContext);
}

/**
 * What the app should call itself on this device.
 *
 * Only a white-label practice replaces the product name — an ordinary workspace
 * gets its logo shown next to ours, never instead of it.
 */
export function useAppIdentity(): { title: string; logoUrl: string | null; tagline: string | null } {
  const brand = useBrand();
  if (brand.whiteLabel && brand.name) {
    return { title: brand.name, logoUrl: brand.logoUrl, tagline: brand.tagline };
  }
  return { title: 'SIRAH LIFE', logoUrl: null, tagline: null };
}
