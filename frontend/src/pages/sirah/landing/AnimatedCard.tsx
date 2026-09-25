import { useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * The landing page's card motion, shared so every section feels the same:
 *   - rises and scales in when scrolled into view, staggered by `index`
 *   - tilts slightly toward the cursor (`tilt`) and lifts (`lift`)
 *   - a soft green spotlight follows the cursor, and a sheen sweeps across
 *   - `.card-icon` inside pops on hover (keyframes in index.css)
 * Reduced-motion visitors get the content with a plain fade and no tilt.
 */
export function AnimatedCard({
  children,
  index = 0,
  tilt = true,
  lift = true,
  className,
}: {
  children: ReactNode;
  index?: number;
  tilt?: boolean;
  lift?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 22, mass: 0.4 };
  const rotateX = useSpring(useTransform(py, [0, 1], [5, -5]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-5, 5]), spring);
  const moving = !reduceMotion;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty('--spot-x', `${x}px`);
    el.style.setProperty('--spot-y', `${y}px`);
    px.set(x / r.width);
    py.set(y / r.height);
  }

  function onLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      initial={moving ? { opacity: 0, y: 28, scale: 0.95 } : { opacity: 0 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: moving ? index * 0.08 : 0 }}
      whileHover={moving && lift ? { y: -6 } : undefined}
      onMouseMove={moving ? onMove : undefined}
      onMouseLeave={moving ? onLeave : undefined}
      style={moving && tilt ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      className={cn('group relative h-full rounded-2xl', className)}
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(109,176,34,0.16), transparent 70%)',
        }}
      />
      <span aria-hidden className="card-sheen pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit]" />
    </motion.div>
  );
}
