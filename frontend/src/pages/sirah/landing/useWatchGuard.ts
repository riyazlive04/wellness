import { useRef } from 'react';
import { WATCHED_FRACTION, markTestimonialWatched } from './testimonialWatch';

/**
 * Makes "watched" mean actually watched.
 *
 * The first version unlocked the form at 80% of the *playhead*, so dragging the
 * scrubber to the end opened it in two seconds. This counts the seconds that
 * really played and refuses a jump forward: seeking past the furthest point
 * reached snaps back to it. Rewinding is allowed - people re-hear a sentence -
 * and re-watched seconds simply aren't counted twice, because progress is
 * measured as "how far have you got", not "how long have you sat here".
 */
export function useWatchGuard(videoRef: React.RefObject<HTMLVideoElement>) {
  /** Furthest point of the video reached by playing, in seconds. */
  const reached = useRef(0);
  /** Playhead at the previous tick, to tell playing apart from seeking. */
  const last = useRef(0);

  function unlockIfEnough(v: HTMLVideoElement) {
    if (v.duration && reached.current >= v.duration * WATCHED_FRACTION) markTestimonialWatched();
  }

  return {
    onTimeUpdate: () => {
      const v = videoRef.current;
      if (!v) return;
      const t = v.currentTime;
      // A normal tick moves a fraction of a second; anything larger is a jump.
      if (t > last.current && t - last.current < 1.5) reached.current = Math.max(reached.current, t);
      last.current = t;
      unlockIfEnough(v);
    },

    onSeeking: () => {
      const v = videoRef.current;
      if (!v) return;
      // One second of slack so a nudge or a buffering hiccup isn't fought.
      if (v.currentTime > reached.current + 1) v.currentTime = reached.current;
      last.current = v.currentTime;
    },

    onEnded: () => {
      const v = videoRef.current;
      if (!v) return;
      reached.current = v.duration || reached.current;
      unlockIfEnough(v);
    },
  };
}
