/**
 * SIRAH LIFE mobile theme — ported from the web design tokens
 * (frontend/src/design-system/tokens.ts). Dark-first, brand blue -> teal ->
 * cyan on an ink canvas. Consumed via useTheme() so screens adapt to the
 * device light/dark setting.
 */

export const brand = {
  blue: '#2563EB', // primary — Sirah logo top
  teal: '#0E9AA8', // mid — "magic" / AI accent
  cyan: '#06B6D4', // accent — ocean
} as const;

export const status = {
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  '2xl': 32,
  pill: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const font = {
  size: { xs: 11, sm: 13, base: 15, lg: 17, xl: 20, '2xl': 24, '3xl': 30, '4xl': 38 },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export interface Theme {
  dark: boolean;
  colors: {
    /** Page background. */
    canvas: string;
    /** Card / elevated surface. */
    surface: string;
    /** Slightly stronger surface (inputs, chips). */
    surfaceStrong: string;
    /** Hairline borders. */
    border: string;
    /** Primary text. */
    text: string;
    /** Secondary / muted text. */
    textMuted: string;
    /** Faint text. */
    textFaint: string;
    /** Brand accents. */
    primary: string;
    accent: string;
    /** On-brand foreground (text over a brand fill). */
    onBrand: string;
    tabBar: string;
    tabActive: string;
    tabInactive: string;
    success: string;
    warning: string;
    danger: string;
  };
  /** Brand CTA gradient stops. */
  gradient: readonly [string, string, string];
}

const dark: Theme = {
  dark: true,
  colors: {
    canvas: '#0A0C10',
    surface: 'rgba(255,255,255,0.04)',
    surfaceStrong: 'rgba(255,255,255,0.07)',
    border: 'rgba(255,255,255,0.08)',
    text: '#F4F6F8',
    textMuted: 'rgba(244,246,248,0.65)',
    textFaint: 'rgba(244,246,248,0.42)',
    primary: brand.blue,
    accent: brand.cyan,
    onBrand: '#FFFFFF',
    tabBar: 'rgba(10,12,16,0.92)',
    tabActive: '#38D6E6',
    tabInactive: 'rgba(244,246,248,0.5)',
    success: status.success,
    warning: status.warning,
    danger: status.danger,
  },
  gradient: [brand.blue, brand.teal, brand.cyan],
};

const light: Theme = {
  dark: false,
  colors: {
    canvas: '#F7F9FB',
    surface: '#FFFFFF',
    surfaceStrong: '#F1F4F7',
    border: 'rgba(17,19,24,0.08)',
    text: '#111318',
    textMuted: 'rgba(17,19,24,0.62)',
    textFaint: 'rgba(17,19,24,0.4)',
    primary: brand.blue,
    accent: brand.teal,
    onBrand: '#FFFFFF',
    tabBar: 'rgba(255,255,255,0.94)',
    tabActive: brand.teal,
    tabInactive: 'rgba(17,19,24,0.5)',
    success: status.success,
    warning: status.warning,
    danger: status.danger,
  },
  gradient: [brand.blue, brand.teal, brand.cyan],
};

export const themes = { dark, light };
