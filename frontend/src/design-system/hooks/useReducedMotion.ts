import { useEffect, useState } from 'react';

/**
 * useReducedMotion — listens to the user's `prefers-reduced-motion` media
 * query. Components can use the result to disable looping ambient
 * animations (orb drift, AIGlow pulse, hero parallax) while keeping
 * essential motion (route transitions, focus states) intact.
 */
export function useReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefers(mql.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange); // Safari < 14
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  return prefers;
}
