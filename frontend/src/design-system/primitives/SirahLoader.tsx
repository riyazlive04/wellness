import { motion } from 'framer-motion';
import { BrandMark, GradientOrb } from '@/design-system';

interface SirahLoaderProps {
  /** Override the default loading copy */
  label?: string;
  /** Hide the brand mark for tiny inline contexts */
  minimal?: boolean;
}

/**
 * SirahLoader — the SIRAH LIFE-themed Suspense fallback. Replaces the
 * legacy Sheizen "Loading wellness experience…" spinner.
 */
export function SirahLoader({ label = 'Loading SIRAH LIFE…', minimal = false }: SirahLoaderProps) {
  if (minimal) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <SpinnerDots />
        <span className="text-xs text-foreground/45">{label}</span>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas text-foreground">
      <GradientOrb color="indigo" size={520} position="-top-32 -left-32" />
      <GradientOrb color="sage" size={420} position="-bottom-32 -right-20" delay={2} driftDuration={22} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-4"
      >
        <BrandMark size={48} animated />
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-foreground/40">
          <SpinnerDots />
          {label}
        </div>
      </motion.div>
    </div>
  );
}

function SpinnerDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-violet-300"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
          transition={{
            duration: 1.2,
            delay: i * 0.18,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
