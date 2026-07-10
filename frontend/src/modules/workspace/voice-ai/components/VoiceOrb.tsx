import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { VoiceState } from '../types';

interface VoiceOrbProps {
  state: VoiceState;
  size?: number;
}

/**
 * VoiceOrb — the visual centerpiece. Four state expressions:
 *   - idle:       slow rotation + gentle pulse, low intensity glow
 *   - listening:  vibrant pulse, expanding "audio ring" of dots
 *   - processing: faster spin, particles, indigo intensification
 *   - responding: emanating concentric ripples (TTS visualization)
 */
export function VoiceOrb({ state, size = 320 }: VoiceOrbProps) {
  const isActive = state !== 'idle' && state !== 'done';

  // Pre-compute a fixed number of audio-ring dots (used during listening)
  const audioDots = useMemo(
    () => Array.from({ length: 36 }).map((_, i) => i),
    [],
  );

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      {/* Outermost: emanating ripples — only during responding */}
      {state === 'responding' && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute rounded-full border border-teal-400/30"
              initial={{ width: size * 0.6, height: size * 0.6, opacity: 0.45 }}
              animate={{
                width: size * 1.4,
                height: size * 1.4,
                opacity: 0,
              }}
              transition={{
                duration: 2.4,
                delay: i * 0.6,
                ease: 'easeOut',
                repeat: Infinity,
              }}
            />
          ))}
        </>
      )}

      {/* Listening audio ring of dots */}
      {state === 'listening' && (
        <div
          className="absolute"
          style={{ width: size * 0.95, height: size * 0.95 }}
        >
          {audioDots.map((i) => {
            const angle = (i / audioDots.length) * 360;
            return (
              <motion.span
                key={i}
                aria-hidden
                className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300"
                style={{
                  transform: `rotate(${angle}deg) translateY(-${size * 0.42}px)`,
                  transformOrigin: '50% 50%',
                }}
                animate={{
                  scale: [1, 1.8, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.6,
                  delay: (i / audioDots.length) * 1.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Outer glow halo */}
      <motion.div
        aria-hidden
        className="absolute rounded-full blur-2xl"
        style={{
          width: size * 0.9,
          height: size * 0.9,
          background:
            state === 'listening'
              ? 'radial-gradient(circle, rgba(125,190,157,0.55), rgba(125,190,157,0) 70%)'
              : state === 'processing'
                ? 'radial-gradient(circle, rgba(14,154,168,0.7), rgba(14,154,168,0) 70%)'
                : state === 'responding'
                  ? 'radial-gradient(circle, rgba(55,189,199,0.6), rgba(14,154,168,0) 70%)'
                  : 'radial-gradient(circle, rgba(14,154,168,0.35), rgba(14,154,168,0) 70%)',
        }}
        animate={{
          scale: isActive ? [1, 1.1, 1] : [1, 1.04, 1],
        }}
        transition={{
          duration: isActive ? 1.8 : 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Middle ring — slow rotation */}
      <motion.div
        aria-hidden
        className="absolute rounded-full border border-foreground/15"
        style={{ width: size * 0.7, height: size * 0.7 }}
        animate={{ rotate: 360 }}
        transition={{
          duration: state === 'processing' ? 6 : 24,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        {/* Decoration dot */}
        <span
          className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-300 shadow-[0_0_8px_rgba(55,189,199,0.8)]"
        />
      </motion.div>

      {/* Inner sphere — solid gradient core */}
      <motion.div
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: size * 0.5,
          height: size * 0.5,
          background: `radial-gradient(circle at 30% 30%, ${
            state === 'listening'
              ? 'rgba(125,190,157,0.9)'
              : state === 'processing'
                ? 'rgba(14,154,168,0.95)'
                : state === 'responding'
                  ? 'rgba(55,189,199,0.85)'
                  : 'rgba(14,154,168,0.6)'
          }, rgba(15,17,21,0.95))`,
          boxShadow:
            state === 'idle'
              ? '0 0 40px -8px rgba(14,154,168,0.55), inset 0 0 30px rgba(0,0,0,0.4)'
              : '0 0 80px -8px rgba(14,154,168,0.85), inset 0 0 40px rgba(0,0,0,0.5)',
        }}
        animate={{
          scale: isActive ? [1, 1.06, 1] : [1, 1.025, 1],
        }}
        transition={{
          duration: 2.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Processing particles */}
      {state === 'processing' &&
        [0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute h-1 w-1 rounded-full bg-white"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
              x: [0, Math.cos((i / 5) * Math.PI * 2) * size * 0.32, 0],
              y: [0, Math.sin((i / 5) * Math.PI * 2) * size * 0.32, 0],
            }}
            transition={{
              duration: 1.4,
              delay: i * 0.18,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
    </div>
  );
}
