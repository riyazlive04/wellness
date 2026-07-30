/**
 * SIRAH LIFE mobile theme — ported from the web design tokens
 * (frontend/src/design-system/tokens.ts). Dark-first, brand blue -> teal ->
 * cyan on an ink canvas. Consumed via useTheme() so screens adapt to the
 * device light/dark setting.
 */

export const brand = {
  blue: '#22A3C3', // gradient start — cyan-blue (web --brand-blue)
  teal: '#0F9AA9', // ocean teal — the primary accent (web --primary)
  cyan: '#2BC4AE', // gradient end — aqua-mint (web --brand-magenta)
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
    primary: brand.teal,
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
    primary: brand.teal,
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

/**
 * Blend a tint over the app canvas into an OPAQUE colour.
 *
 * Large tile fills must be opaque: a translucent background on an elevated
 * `Card` lets the card's own drop shadow bleed through on Android, producing a
 * muddy frame with a lighter inner rectangle (worst in light mode). Blending to
 * an opaque colour keeps the same soft pastel look with nothing to composite.
 */
export function tintFill(tint: string, dark: boolean): string {
  return mixHex(dark ? '#12151B' : '#F7F9FB', tint, dark ? 0.16 : 0.09);
}

function mixHex(base: string, over: string, amount: number): string {
  const b = parseHex(base);
  const o = parseHex(over);
  const m = (i: number) => Math.round(o[i] * amount + b[i] * (1 - amount));
  return '#' + [m(0), m(1), m(2)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function parseHex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
