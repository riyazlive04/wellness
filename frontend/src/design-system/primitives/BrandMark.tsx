import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  size?: number;
  /** Whether to animate a subtle hover glow. Kept for API back-compat. */
  animated?: boolean;
  className?: string;
}

/**
 * Sirah Digital brand mark.
 *
 * The real logo lives at `/sirah-logo.png` in the frontend `public/` dir.
 * If that file is missing (404), we fall back to an inline SVG so the app
 * keeps rendering — useful in dev, on PR previews, or if someone forgets to
 * include the asset in a deploy.
 */
export function BrandMark({ size = 48, animated = true, className }: BrandMarkProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {!imgFailed ? (
        <motion.img
          src="/sirah-logo.png"
          alt="Sirah Digital"
          width={size}
          height={size}
          onError={() => setImgFailed(true)}
          // The PNG isn't transparent (white background) so we keep the
          // crop rectangular and let it sit on whatever surface we're on.
          // contain prevents distortion at non-square render targets.
          style={{ width: size, height: size, objectFit: 'contain' }}
          initial={animated ? { opacity: 0, scale: 0.96 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        />
      ) : (
        // Fallback SVG — only renders if `/sirah-logo.png` 404s.
        <svg
          viewBox="0 0 48 48"
          fill="none"
          width={size}
          height={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="sirahOuter" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0"   stopColor="#2563EB" />
              <stop offset="0.5" stopColor="#0e9aa8" />
              <stop offset="1"   stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="20" stroke="url(#sirahOuter)" strokeWidth="2" opacity="0.9" />
          <circle cx="24" cy="24" r="12" stroke="url(#sirahOuter)" strokeWidth="1.5" opacity="0.7" />
          <circle cx="24" cy="24" r="2" fill="url(#sirahOuter)" />
        </svg>
      )}
    </div>
  );
}