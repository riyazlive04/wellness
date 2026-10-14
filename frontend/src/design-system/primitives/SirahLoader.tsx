import { motion } from 'framer-motion';

interface SirahLoaderProps {
  /** Override the default loading copy */
  label?: string;
  /** Hide the brand mark for tiny inline contexts */
  minimal?: boolean;
}

/**
 * SirahLoader — the NUSI loading screen: the logo pops in and the name
 * follows. `minimal` keeps a small inline spinner for tight spots.
 */
export function SirahLoader({ label = 'Loading NUSI…', minimal = false }: SirahLoaderProps) {
  if (minimal) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <SpinnerDots />
        <span className="text-xs text-foreground/75 dark:text-foreground/60">{label}</span>
      </div>
    );
  }

  return (
    <div role="status" aria-label={label} className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas text-foreground">
      <style>{POP_CSS}</style>
      <div className="flex flex-col items-center">
        <img src="/nusi-mark.png" alt="" className="nusi-pop h-[76px] w-[76px] rounded-[20px]" />
        <div aria-hidden className="mt-3.5 pl-[0.32em] text-[15px] font-bold tracking-[0.32em] text-foreground">
          {'NUSI'.split('').map((ch, i) => (
            <span key={i} className="nusi-letter inline-block" style={{ animationDelay: `${i * 0.1}s` }}>{ch}</span>
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}

/** "Pop + name": the logo pops in, then N U S I follow one by one, on a loop. */
const POP_CSS = `
.nusi-pop { animation: nusi-pop 2.8s cubic-bezier(.34, 1.56, .64, 1) infinite; }
.nusi-letter { opacity: 0; animation: nusi-letter 2.8s ease-out infinite; }
@keyframes nusi-pop { 0% { transform: scale(.4); opacity: 0; } 18% { transform: scale(1); opacity: 1; } 85% { transform: scale(1); opacity: 1; } 100% { transform: scale(.9); opacity: 0; } }
@keyframes nusi-letter { 0%, 20% { opacity: 0; transform: translateY(8px); } 32%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .nusi-pop, .nusi-letter { animation: none; opacity: 1; } }
`;

function SpinnerDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-teal-300"
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
