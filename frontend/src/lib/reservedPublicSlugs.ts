/**
 * First path segments reserved for the app. Public bios live at /:slug —
 * these must never be claimable as workspace slugs.
 */
export const RESERVED_PUBLIC_SLUGS = new Set([
  // App shells / auth
  'admin', 'api', 'app', 'assets', 'auth', 'dashboard', 'join', 'login', 'logout',
  'me', 'onboarding', 'p', 'portal', 'register', 'reset-password', 'signup',
  'team-invite',
  // Owner routes
  'ai', 'ai-ecosystem', 'analytics', 'appointments', 'assessments', 'automation',
  'billing', 'clients', 'collaborate', 'community', 'messaging', 'notifications',
  'organizations', 'plate-vision', 'privacy-policy', 'products', 'programs',
  'reports', 'settings', 'subscription', 'team', 'voice', 'voice-ai',
  // Marketing / legal / infra
  'about', 'blog', 'contact', 'docs', 'favicon', 'health', 'help', 'home',
  'index', 'legal', 'pricing', 'privacy', 'robots', 'sitemap', 'status',
  'support', 'terms', 'www',
]);

export function isReservedPublicSlug(slug: string | undefined | null): boolean {
  if (!slug) return true;
  return RESERVED_PUBLIC_SLUGS.has(slug.trim().toLowerCase());
}
