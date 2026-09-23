/**
 * Meta (Facebook) Pixel for the landing page - the ad traffic that the booking
 * form is built for.
 *
 * Loaded only on the landing page, and only when VITE_META_PIXEL_ID is set, so
 * the workspace app (client health data) never ships a tracker and local dev
 * never pollutes the ad account. The script is injected on first use rather
 * than sitting in index.html for the same reason.
 *
 * Events sent:
 *   PageView  - when the landing page opens
 *   Lead      - when a booking is saved (both codes verified, so no bot noise)
 */

const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim();

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: unknown };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** Meta's own snippet, in TypeScript: a queueing stub, then the real script. */
function installStub(): Fbq {
  if (window.fbq) return window.fbq;
  const fbq: Fbq = function (...args: unknown[]) {
    if (fbq.callMethod) (fbq.callMethod as (...a: unknown[]) => void).apply(fbq, args);
    else (fbq.queue as unknown[]).push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;
  window._fbq = fbq;

  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  return fbq;
}

/** Start the pixel and record the page view. Safe to call more than once. */
export function initMetaPixel(): void {
  if (!PIXEL_ID || typeof window === 'undefined') return;
  const fbq = installStub();
  if (!window.__nusiPixelStarted) {
    fbq('init', PIXEL_ID);
    window.__nusiPixelStarted = true;
  }
  fbq('track', 'PageView');
}

/** A standard Meta event, ignored when no pixel is configured. */
export function trackPixel(event: 'Lead' | 'ViewContent' | 'Contact', params?: Record<string, unknown>): void {
  if (!PIXEL_ID) return;
  window.fbq?.('track', event, params);
}

declare global {
  interface Window {
    __nusiPixelStarted?: boolean;
  }
}
