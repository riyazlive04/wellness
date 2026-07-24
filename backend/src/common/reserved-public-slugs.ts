/**
 * First path segments reserved for the SIRAH LIFE app. Public bios are served
 * at /:slug on the frontend — these must never be claimable as workspace slugs.
 */
export const RESERVED_PUBLIC_SLUGS = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'dashboard', 'join', 'login', 'logout',
  'me', 'onboarding', 'p', 'portal', 'register', 'reset-password', 'signup',
  'team-invite',
  'ai', 'ai-ecosystem', 'analytics', 'appointments', 'assessments', 'automation',
  'billing', 'clients', 'collaborate', 'community', 'messaging', 'notifications',
  'organizations', 'plate-vision', 'privacy-policy', 'products', 'programs',
  'reports', 'settings', 'subscription', 'team', 'voice', 'voice-ai',
  'about', 'blog', 'contact', 'docs', 'favicon', 'health', 'help', 'home',
  'index', 'legal', 'pricing', 'privacy', 'robots', 'sitemap', 'status',
  'support', 'terms', 'www',
]);

export function assertSlugNotReserved(slug: string): void {
  const normalized = slug.trim().toLowerCase();
  if (RESERVED_PUBLIC_SLUGS.has(normalized)) {
    throw new Error(`RESERVED:${normalized}`);
  }
}

export function isReservedPublicSlug(slug: string | undefined | null): boolean {
  if (!slug) return true;
  return RESERVED_PUBLIC_SLUGS.has(slug.trim().toLowerCase());
}
