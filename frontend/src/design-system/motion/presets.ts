/**
 * Framer Motion presets for SIRAH LIFE.
 *
 * Apply these instead of redefining variants inline. The presets enforce
 * the motion budget (≤ 480 ms for entries, ≤ 280 ms for hovers) and
 * the standard easing curves.
 */

import type { Variants, Transition } from 'framer-motion';
import { motion as tokens } from '../tokens';

const ease = tokens.ease.soft;

// ─── Entry animations ────────────────────────────────────────────────────

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: tokens.duration.base, ease } },
  exit:    { opacity: 0, transition: { duration: tokens.duration.fast, ease } },
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: tokens.duration.base, ease } },
  exit:    { opacity: 0, y: -8, transition: { duration: tokens.duration.fast, ease } },
};

export const fadeDown: Variants = {
  initial: { opacity: 0, y: -12 },
  animate: { opacity: 1, y: 0, transition: { duration: tokens.duration.base, ease } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: tokens.duration.base, ease } },
};

// Staggered children — use on container, then fadeUp on items
export const stagger = (delayChildren = 0.08, staggerChildren = 0.06): Variants => ({
  animate: {
    transition: { delayChildren, staggerChildren },
  },
});

// ─── Interactive ─────────────────────────────────────────────────────────

export const hoverLift: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
};

export const tapPress = {
  scale: 0.98,
  transition: { duration: 0.08 },
};

// ─── Page-level ──────────────────────────────────────────────────────────

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: tokens.duration.base, ease } },
  exit:    { opacity: 0, y: -6, transition: { duration: tokens.duration.fast, ease } },
};

// ─── AI/ambient ──────────────────────────────────────────────────────────

// Slow, soft pulse for AI elements. Looped.
export const aiPulse: Variants = {
  animate: {
    opacity: [0.6, 1, 0.6],
    scale:   [1, 1.02, 1],
    transition: {
      duration: 4,
      ease: 'easeInOut',
      repeat: Infinity,
    },
  },
};

// Floating orbs for hero backgrounds
export const float = (delay = 0): Variants => ({
  animate: {
    y: [0, -16, 0],
    transition: {
      duration: 6,
      ease: 'easeInOut',
      repeat: Infinity,
      delay,
    },
  },
});

// Respects reduced-motion: returns "off" when set
export function respectReducedMotion<T extends Variants | Transition>(value: T): T | Record<string, never> {
  if (typeof window === 'undefined') return value;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return prefersReduced ? {} : value;
}
