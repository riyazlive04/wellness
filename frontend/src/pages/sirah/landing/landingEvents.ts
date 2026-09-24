import { pushEvent } from './tagManager';

/**
 * Funnel tracking for the landing page, pushed to the GTM data layer. GTM sends
 * these to GA4 only; the one Meta conversion is `nusi_lead` (see LeadForm).
 *
 * Every event fires at most once per page load for a given key, so a visitor
 * scrolling up and down, or re-checking a field, doesn't inflate the funnel
 * numbers. `sessionKey` lets a few events (video watched, codes verified)
 * dedupe across the whole visit instead, matching what they actually gate.
 */

const firedThisLoad = new Set<string>();

function once(key: string, push: () => void) {
  if (firedThisLoad.has(key)) return;
  firedThisLoad.add(key);
  push();
}

/** Video watched enough to unlock the booking form (once per visit). */
export function trackVideoWatched() {
  once('video_watched', () => pushEvent('nusi_video_watched'));
}

/** WhatsApp or email code verified (each fires once per visit). */
export function trackVerified(channel: 'phone' | 'email') {
  once(`verified_${channel}`, () => pushEvent('nusi_verified', { channel }));
}

/** The booking API call failed after both codes were verified. */
export function trackBookingFailed(reason: string) {
  // Not deduped - if it fails twice, that is worth two events.
  pushEvent('nusi_book_failed', { reason });
}

/**
 * Any button or link on the landing page was clicked - every one carries a
 * stable `id` naming what it is and, loosely, where it sits (e.g. 'nav_book',
 * 'otp_send_phone', 'footer_privacy'), so a GTM trigger can filter on it.
 * Not deduped: a visitor clicking "Send code" three times is three clicks.
 */
export function trackButtonClick(id: string, params?: Record<string, unknown>) {
  pushEvent('nusi_button_click', { id, ...params });
}

/** Scroll depth milestones (25/50/75/100), each fired once per visit. */
const SCROLL_MILESTONES = [25, 50, 75, 100] as const;
let deepestScrollFired = 0;

export function trackScrollDepth(fractionScrolled: number) {
  const pct = Math.round(fractionScrolled * 100);
  for (const m of SCROLL_MILESTONES) {
    if (pct >= m && deepestScrollFired < m) {
      deepestScrollFired = m;
      pushEvent('nusi_scroll_depth', { percent: m });
    }
  }
}
