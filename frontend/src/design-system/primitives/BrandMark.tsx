import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  size?: number;
  /** Whether to animate the inner orbit dot */
  animated?: boolean;
  className?: string;
}

/**
 * SIRAH LIFE brand mark — a soft "life ring" composed of two concentric
 * gradient strokes with a single orbiting dot, suggesting wellness in
 * motion. SVG-only, no raster assets.
 */
export function BrandMark({ size = 48, animated = true, className }: BrandMarkProps) {
  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sirahOuter" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6366F1" />
            <stop offset="1" stopColor="#7DBE9D" />
          </linearGradient>
          <linearGradient id="sirahInner" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7DBE9D" />
            <stop offset="1" stopColor="#6366F1" />
          </linearGradient>
        </defs>

        {/* Outer ring */}
        <circle cx="24" cy="24" r="20" stroke="url(#sirahOuter)" strokeWidth="2" opacity="0.9" />

        {/* Inner ring (slightly off-center for organic feel) */}
        <circle cx="24" cy="24" r="12" stroke="url(#sirahInner)" strokeWidth="1.5" opacity="0.7" />

        {/* Center dot */}
        <circle cx="24" cy="24" r="2" fill="url(#sirahOuter)" />
      </svg>

      {/* Orbiting dot */}
      {animated && (
        <motion.span
          aria-hidden
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]"
          style={{ originX: 0.5, originY: 0.5 }}
          animate={{
            x: [size * 0.42, 0, -size * 0.42, 0, size * 0.42],
            y: [0, -size * 0.42, 0, size * 0.42, 0],
          }}
          transition={{ duration: 7, ease: 'linear', repeat: Infinity }}
        />
      )}
    </div>
  );
}
