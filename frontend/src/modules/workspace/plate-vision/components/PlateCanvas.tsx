import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { DetectedItem, ScanState } from '../types';
import { cn } from '@/lib/utils';

interface PlateCanvasProps {
  imageUrl: string;
  fallbackColor?: string;
  items: DetectedItem[];
  /** Show all bounding boxes only in `results` state */
  state: ScanState;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

/**
 * PlateCanvas — the image of the plate with bounding boxes drawn over.
 * During `scanning`, a sweep line and boxes appear progressively. During
 * `results`, boxes are static and tappable.
 */
export function PlateCanvas({
  imageUrl,
  fallbackColor = '#1B1E25',
  items,
  state,
  selectedId,
  onSelect,
}: PlateCanvasProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-surface-2">
      {/* Image or fallback */}
      {!imgFailed ? (
        <img
          src={imageUrl}
          alt="Plate"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${fallbackColor}, hsl(var(--surface-2)))`,
          }}
        >
          <span className="text-xs uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55">
            Plate preview
          </span>
        </div>
      )}

      {/* Vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"
      />

      {/* AI scan sweep line — only during scanning */}
      {state === 'scanning' && (
        <>
          <motion.div
            aria-hidden
            initial={{ y: '-10%' }}
            animate={{ y: '110%' }}
            transition={{ duration: 2.4, ease: 'easeInOut' }}
            className="pointer-events-none absolute inset-x-0 z-10 h-1"
            style={{
              background:
                'linear-gradient(180deg, rgba(14,154,168,0) 0%, rgba(14,154,168,0.9) 50%, rgba(14,154,168,0) 100%)',
              boxShadow: '0 0 24px rgba(14,154,168,0.8)',
            }}
          />
          {/* Grid overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'linear-gradient(rgba(14,154,168,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(14,154,168,0.2) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />
        </>
      )}

      {/* Bounding boxes — appear during scanning, persist during results */}
      <AnimatePresence>
        {(state === 'scanning' || state === 'results') &&
          items.map((item, i) => {
            const selected = selectedId === item.id;
            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onSelect?.(item.id)}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  delay: state === 'scanning' ? 0.6 + i * 0.18 : 0,
                  duration: 0.32,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={cn(
                  'group absolute z-20 rounded-md border-2 text-left transition-all',
                  selected
                    ? 'border-emerald-400 shadow-[0_0_20px_rgba(125,190,157,0.5)]'
                    : 'border-teal-300/70 shadow-[0_0_16px_rgba(14,154,168,0.35)] hover:border-emerald-300 hover:shadow-[0_0_18px_rgba(125,190,157,0.5)]',
                )}
                style={{
                  left:   `${item.box.x}%`,
                  top:    `${item.box.y}%`,
                  width:  `${item.box.w}%`,
                  height: `${item.box.h}%`,
                }}
                aria-label={item.name}
              >
                {/* Top-left chip with confidence */}
                <span
                  className={cn(
                    'absolute -top-6 left-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-tight',
                    selected
                      ? 'bg-emerald-400 text-canvas'
                      : 'bg-teal-300 text-canvas',
                  )}
                >
                  {Math.round(item.confidence * 100)}%
                </span>
              </motion.button>
            );
          })}
      </AnimatePresence>
    </div>
  );
}
