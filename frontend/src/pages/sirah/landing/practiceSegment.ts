/**
 * Which kind of practice the visitor runs - solo, small team, or a clinic with
 * several dietitians. Collected once per visit by <SegmentPopup> so the hero
 * headline can speak to their actual situation instead of a one-size-fits-all
 * line that fits nobody perfectly.
 *
 * Same external-store shape as testimonialWatch.ts: a tiny module-level store
 * (not React context) so the popup and the hero, which sit in different
 * subtrees, can share it without prop-drilling.
 */

export type PracticeSegment = 'solo' | 'small' | 'clinic';

const STORAGE_KEY = 'nusi:practice-segment';
const ASKED_KEY = 'nusi:segment-asked';
const NAME_KEY = 'nusi:visitor-name';

function readStored(): PracticeSegment | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === 'solo' || v === 'small' || v === 'clinic' ? v : null;
  } catch {
    return null;
  }
}

let segment: PracticeSegment | null = typeof window === 'undefined' ? null : readStored();

function readName(): string | null {
  try {
    return sessionStorage.getItem(NAME_KEY) || null;
  } catch {
    return null;
  }
}

let visitorName: string | null = typeof window === 'undefined' ? null : readName();
const listeners = new Set<() => void>();

export function subscribeSegment(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSegment() {
  return segment;
}

export function setSegment(next: PracticeSegment) {
  segment = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, next);
    sessionStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* private mode - the choice still lives in memory for this visit */
  }
  listeners.forEach((l) => l());
}

/** The name the visitor gave in the popup (already checked as a real name). */
export function getVisitorName() {
  return visitorName;
}

export function setVisitorName(next: string) {
  visitorName = next.trim().replace(/\s+/g, ' ');
  try {
    sessionStorage.setItem(NAME_KEY, visitorName);
  } catch {
    /* private mode - kept in memory for this visit */
  }
  listeners.forEach((l) => l());
}

/** "Priya" from "Dt. Priya Sharma" - for greeting someone. */
export function firstNameOf(full: string): string {
  const words = full.trim().split(/\s+/).filter((w) => !/^(dr|dt|mr|mrs|ms|miss|prof)\.?$/i.test(w));
  const first = words[0] ?? full.trim();
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Have we already asked (or has the visitor already closed the popup) this visit? */
export function hasAsked(): boolean {
  try {
    return sessionStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark as asked without picking a segment - e.g. the visitor closed the popup. */
export function markAsked() {
  try {
    sessionStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* not fatal */
  }
}
