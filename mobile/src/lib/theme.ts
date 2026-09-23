/**
 * SIRAH LIFE mobile theme — ported from the web design tokens
 * (frontend/src/design-system/tokens.ts). Dark-first, brand blue -> teal ->
 * cyan on an ink canvas. Consumed via useTheme() so screens adapt to the
 * device light/dark setting. Brand colour is the leaf green of the NUSI logo.
 */

export const brand = {
  blue: '#558E19', // primary — NUSI leaf green (key name kept for compatibility)
  teal: '#6DB022', // mid — brighter leaf green / AI accent
  cyan: '#8BCB3A', // accent — lime highlight
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
    tabActive: '#A9DC66',
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

/**
 * Re-tint a theme with a practice's own palette.
 *
 * Only the brand-carrying slots move: primary, accent, the CTA gradient and the
 * active tab tint. Canvas, surfaces, borders and text are left alone — those
 * carry the light/dark contrast guarantees, and letting an arbitrary
 * practitioner-picked hex near them is how a client ends up with unreadable
 * body text on their own app.
 *
 * Returns the theme unchanged when the practice set no colours, so the default
 * SIRAH palette stays the single source of truth for everyone else.
 */
export function withBrand(
  theme: Theme,
  brand: { primary?: string | null; accent?: string | null } | null | undefined,
): Theme {
  const primary = brand?.primary ?? null;
  const accent = brand?.accent ?? null;
  if (!primary && !accent) return theme;

  const nextPrimary = primary ?? theme.colors.primary;
  const nextAccent = accent ?? theme.colors.accent;

  return {
    ...theme,
    colors: {
      ...theme.colors,
      primary: nextPrimary,
      accent: nextAccent,
      // The active tab has to stay distinguishable on the tab bar. Dark mode
      // reads the accent better, light mode the primary.
      tabActive: theme.dark ? nextAccent : nextPrimary,
    },
    // Middle stop interpolated by the pair so a two-colour brand still yields a
    // three-stop gradient rather than a hard split.
    gradient: [nextPrimary, mixHex(nextPrimary, nextAccent, 0.5), nextAccent] as const,
  };
}

/** Blend two #RGB/#RRGGBB colours. Falls back to `a` if either is unparseable. */
function mixHex(a: string, b: string, ratio: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * ratio);
  return '#' + [ch(0), ch(1), ch(2)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
