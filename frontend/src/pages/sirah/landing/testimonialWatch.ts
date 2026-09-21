/**
 * Tracks whether the visitor has watched the hero testimonial.
 *
 * The landing lead form stays locked until they have, so every lead has seen a
 * real dietitian talk about NUSI first. Kept as a tiny external store (rather
 * than context) so the hero and the form - which sit in different subtrees -
 * can share it without threading props through the page.
 *
 * "Watched" means reaching WATCHED_FRACTION of the video, or its end. The flag
 * lasts for this visit only (sessionStorage): a new tab or a later visit has to
 * watch again before the booking form opens.
 */

const STORAGE_KEY = 'nusi:testimonial-watched';

/** How much of the video counts as watched. */
export const WATCHED_FRACTION = 0.8;

/** Fired on `window` to ask the hero to scroll into view and start playing. */
export const PLAY_TESTIMONIAL_EVENT = 'nusi:play-testimonial';

function readStored(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // private mode / blocked storage - just start locked
  }
}

// Earlier builds remembered this forever in localStorage; clear that so it
// can't keep the form open on later visits.
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked - nothing to clear */
  }
}

let watched = typeof window === 'undefined' ? false : readStored();
const listeners = new Set<() => void>();

export function subscribeWatched(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWatched() {
  return watched;
}

export function markTestimonialWatched() {
  if (watched) return;
  watched = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* not fatal - the flag still lives in memory for this visit */
  }
  listeners.forEach((l) => l());
}

/** Ask the hero video to scroll into view and play (used by the locked form). */
export function requestTestimonialPlay() {
  window.dispatchEvent(new CustomEvent(PLAY_TESTIMONIAL_EVENT));
}
