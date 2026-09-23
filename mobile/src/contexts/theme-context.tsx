/**
 * Theme preference: System / Light / Dark, persisted across launches.
 * `useTheme()` (hooks/use-theme) reads the resolved theme from here, so every
 * screen re-themes automatically when the user changes the setting.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { useBrand } from '@/contexts/brand-context';
import { themes, withBrand, type Theme } from '@/lib/theme';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'sirah-theme-mode';

interface ThemeContextValue {
  /** What the user picked. */
  mode: ThemeMode;
  /** What is actually rendered right now. */
  resolved: 'light' | 'dark';
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    // Dark-first: an unspecified system scheme falls back to dark.
    const resolved: 'light' | 'dark' =
      mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
    return { mode, resolved, theme: themes[resolved], setMode };
  }, [mode, system, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Re-provides the theme with the practice's palette applied.
 *
 * Sits INSIDE AuthProvider/BrandProvider because the brand is only knowable
 * once there is a session, while ThemeProvider has to stay at the very root so
 * the light/dark preference is available to the splash and auth screens. Every
 * consumer below this point transparently reads the branded theme through the
 * same useTheme() — no screen needs to know branding exists.
 */
export function BrandedThemeProvider({ children }: { children: React.ReactNode }) {
  const ctx = useContext(ThemeContext);
  const brand = useBrand();

  const value = useMemo<ThemeContextValue | undefined>(
    () => (ctx ? { ...ctx, theme: withBrand(ctx.theme, brand) } : undefined),
    [ctx, brand],
  );

  if (!value) return <>{children}</>;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Resolved theme object. Falls back to dark if used outside the provider. */
export function useResolvedTheme(): Theme {
  return useContext(ThemeContext)?.theme ?? themes.dark;
}

/** Preference controls for the Settings screen. */
export function useThemeMode(): { mode: ThemeMode; resolved: 'light' | 'dark'; setMode: (m: ThemeMode) => void } {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { mode: 'system', resolved: 'dark', setMode: () => {} };
  return { mode: ctx.mode, resolved: ctx.resolved, setMode: ctx.setMode };
}
