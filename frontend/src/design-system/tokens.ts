/**
 * SIRAH LIFE design tokens.
 *
 * The single source of truth for the visual language. Tailwind classes
 * are still preferred for layout; tokens are used directly for one-off
 * computed values (animations, gradients, shadows) where Tailwind would
 * be awkward.
 *
 * Light / dark variants are exposed as named groups; the theme provider
 * decides which to apply via `data-theme="dark|light"` on <html>.
 */

export const palette = {
  // ─── Sirah Digital brand: blue → violet → magenta ──────────────────
  blue: {
    50:  '#EFF6FF',
    100: '#DBEAFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',  // brand primary — Sirah logo top
    700: '#1D4ED8',
    900: '#1E3A8A',
  },
  violet: {
    50:  '#E6F7F9',
    100: '#CBEFF3',
    300: '#7EDDE4',
    400: '#37BDC7',
    500: '#0E9AA8',  // brand mid — teal accent / "magic"
    600: '#0B7C88',
    700: '#0A616B',
    900: '#0A464E',
  },
  magenta: {
    50:  '#ECFEFF',
    100: '#CFFAFE',
    300: '#7DE4EE',
    400: '#38D6E6',
    500: '#06B6D4',  // brand accent — cyan (ocean)
    600: '#0891B2',
    700: '#0E7490',
    900: '#164E63',
  },
  // ─── Status semantics (universal, kept intact) ────────────────────
  sage: { 400: '#34D399', 500: '#10B981' },  // success / active / healthy
  amber: { 400: '#FBBF24', 500: '#F59E0B' }, // warning / medium
  coral: { 400: '#F87171', 500: '#EF4444' }, // at-risk / error
  sand:  { 300: '#E5C58C', 500: '#C99B4F' },

  // ─── Legacy aliases (kept for backwards compat with existing chips) ─
  indigo: {
    50:  '#E6F7F9',
    100: '#CBEFF3',
    300: '#7EDDE4',
    400: '#37BDC7',
    500: '#0E9AA8',  // remapped to teal so old chips still read as brand
    600: '#0B7C88',
    700: '#0A616B',
    900: '#0A464E',
  },

  // Neutrals (dark-first canvas)
  ink: {
    0:   '#FFFFFF',
    50:  '#FAFBFC',
    100: '#F4F6F8',
    200: '#E5E7EB',
    400: '#9CA3AF',
    600: '#6E7480',
    700: '#4B5563',
    800: '#1F2937',
    900: '#111318',
    950: '#0A0C10',
  },
};

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '18px',
  xl: '24px',
  '2xl': '32px',
  pill: '9999px',
};

export const shadow = {
  soft:    '0 4px 16px -8px rgba(0, 0, 0, 0.12)',
  elevate: '0 12px 32px -12px rgba(0, 0, 0, 0.18)',
  hover:   '0 20px 48px -16px rgba(0, 0, 0, 0.22)',
  // AI signature glow — Sirah brand violet, used sparingly on AI-generated surfaces
  aiGlow:  '0 0 40px -10px rgba(14, 154, 168, 0.45), 0 0 80px -30px rgba(14, 154, 168, 0.25)',
  aiGlowSoft: '0 0 24px -8px rgba(14, 154, 168, 0.25)',
};

export const motion = {
  ease: {
    soft:   [0.22, 1, 0.36, 1] as const,         // ease-out-quart
    snappy: [0.34, 1.56, 0.64, 1] as const,      // gentle spring
    linear: [0, 0, 1, 1] as const,
  },
  duration: {
    instant: 0.12,
    fast:    0.18,
    base:    0.28,
    slow:    0.48,
    cinematic: 0.72,
  },
  spring: {
    gentle: { type: 'spring' as const, stiffness: 200, damping: 28 },
    snappy: { type: 'spring' as const, stiffness: 380, damping: 32 },
  },
};

export const blur = {
  glass: 'blur(20px) saturate(180%)',
  glassHeavy: 'blur(40px) saturate(200%)',
};

export const gradients = {
  // Brand canvas — Sirah Digital blue → violet → magenta on dark
  canvasDark:
    'radial-gradient(circle at 20% 0%, rgba(37,99,235,0.20), transparent 50%),' +
    'radial-gradient(circle at 80% 100%, rgba(6,182,212,0.18), transparent 55%),' +
    'linear-gradient(180deg, #0A0C10 0%, #111318 100%)',

  canvasLight:
    'radial-gradient(circle at 20% 0%, rgba(37,99,235,0.10), transparent 50%),' +
    'radial-gradient(circle at 80% 100%, rgba(6,182,212,0.10), transparent 55%),' +
    'linear-gradient(180deg, #FAFBFC 0%, #F4F6F8 100%)',

  // AI surface — for cards with AI-generated content (violet tint)
  aiCard:
    'linear-gradient(135deg, rgba(14,154,168,0.12), rgba(6,182,212,0.06))',

  // Premium button — Sirah brand gradient (blue → violet → magenta)
  cta: 'linear-gradient(135deg, #2563EB 0%, #0e9aa8 50%, #06b6d4 100%)',
  ctaHover: 'linear-gradient(135deg, #1D4ED8 0%, #0b7c88 50%, #0891b2 100%)',
};

export const tokens = {
  palette,
  radius,
  shadow,
  motion,
  blur,
  gradients,
} as const;

export type Tokens = typeof tokens;
