/**
 * Google Tag Manager for the landing page.
 *
 * Same rules as the Meta pixel next door: loaded only on the landing page, and
 * only when VITE_GTM_ID is set, so the workspace app (client health data) never
 * ships a tag container and local dev never reaches the live container.
 *
 * GTM is the place to add further tags (Google Ads, Analytics, even the Meta
 * pixel) without another deploy: this file only opens the container and pushes
 * what happens on the page into the data layer.
 *
 * Events pushed:
 *   nusi_page_view   - the landing page opened
 *   nusi_lead        - a booking was saved (both codes verified)
 */

const GTM_ID = (import.meta.env.VITE_GTM_ID as string | undefined)?.trim();

declare global {
  interface Window {
    dataLayer?: unknown[];
    __nusiGtmStarted?: boolean;
  }
}

/** Load the container and record the page view. Safe to call more than once. */
export function initTagManager(): void {
  if (!GTM_ID || typeof window === 'undefined' || window.__nusiGtmStarted) return;
  window.__nusiGtmStarted = true;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`;
  document.head.appendChild(s);

  pushEvent('nusi_page_view');
}

/** Push an event for GTM triggers. Does nothing when no container is set. */
export function pushEvent(event: string, params?: Record<string, unknown>): void {
  if (!GTM_ID || typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}
