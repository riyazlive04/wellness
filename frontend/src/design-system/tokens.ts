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
  // Brand
  sage: {
    50: '#F1F8F4',
    100: '#DCEEE3',
    200: '#B9DCC8',
    300: '#8FC7A8',
    400: '#7DBE9D',  // primary wellness
    500: '#5FA985',
    600: '#4A8C6C',
    700: '#3B6F56',
    900: '#1F3A2D',
  },
  indigo: {
    50:  '#EEF0FF',
    100: '#DCE0FF',
    300: '#A5ABFF',
    400: '#8087FF',
    500: '#6366F1', // AI accent
    600: '#4F46E5',
    700: '#4338CA',
    900: '#1E1B4B',
  },
  sand: {
    50:  '#FBF7EE',
    100: '#F5E8D3',
    300: '#E5C58C',
    500: '#C99B4F',
  },
  coral:  { 400: '#F87171', 500: '#EF4444' },
  amber:  { 400: '#FBBF24', 500: '#F59E0B' },

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
  // AI signature glow — used sparingly on AI-generated surfaces
  aiGlow:  '0 0 40px -10px rgba(99, 102, 241, 0.45), 0 0 80px -30px rgba(99, 102, 241, 0.25)',
  aiGlowSoft: '0 0 24px -8px rgba(99, 102, 241, 0.25)',
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
  // Brand canvas — used behind hero, auth, marketing
  canvasDark:
    'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.18), transparent 50%),' +
    'radial-gradient(circle at 80% 100%, rgba(125,190,157,0.16), transparent 55%),' +
    'linear-gradient(180deg, #0A0C10 0%, #111318 100%)',

  canvasLight:
    'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.10), transparent 50%),' +
    'radial-gradient(circle at 80% 100%, rgba(125,190,157,0.10), transparent 55%),' +
    'linear-gradient(180deg, #FAFBFC 0%, #F4F6F8 100%)',

  // AI surface — for cards with AI-generated content
  aiCard:
    'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(125,190,157,0.06))',

  // Premium button
  cta: 'linear-gradient(135deg, #6366F1 0%, #7DBE9D 100%)',
  ctaHover: 'linear-gradient(135deg, #4F46E5 0%, #5FA985 100%)',
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
