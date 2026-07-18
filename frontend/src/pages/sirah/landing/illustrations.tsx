import { motion } from 'framer-motion';

/**
 * Six bespoke SVG illustrations, one per feature card.
 * All draw with `currentColor` for stroke so the parent controls the hue
 * via a Tailwind `text-{accent}-{n}` class. Stroke width is uniform (1.6)
 * so the line family stays visually consistent across the grid.
 *
 * Animation philosophy
 *  - Continuous, low-amplitude loops on the 4 most "alive" features
 *    (Programs / Analytics / Voice / Vision). They breathe.
 *  - Hover-triggered detail on the 2 quieter ones (Workspace / Billing),
 *    revealed via `group-hover:` so the card's existing hover state
 *    drives them — no extra props plumbed.
 *  - Easing: `easeInOut` everywhere, repeat-yoyo where possible. Keeps
 *    the motion sleepy, not twitchy.
 */

const STROKE_WIDTH = 1.6;
const SHARED_PROPS = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: STROKE_WIDTH,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

interface IllustrationProps {
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────
// 1. Workspace — three stacked tenant cards, hover spreads them apart.
// ─────────────────────────────────────────────────────────────────────
// Uses named `rest` / `hover` variants. The parent FeatureCard sets
// whileHover="hover" so these fire when the *whole card* is hovered,
// not just the illustration itself.
export function WorkspaceIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Back card */}
      <motion.g
        variants={{ rest: { x: 0, y: 0 }, hover: { x: 8, y: -6 } }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <rect x="22" y="14" width="36" height="28" rx="3.5" opacity="0.35" />
      </motion.g>

      {/* Middle card */}
      <motion.g
        variants={{ rest: { x: 0, y: 0 }, hover: { x: 4, y: -3 } }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <rect x="18" y="22" width="36" height="28" rx="3.5" opacity="0.55" />
      </motion.g>

      {/* Front card - with content lines */}
      <g>
        <rect x="14" y="30" width="40" height="32" rx="4" />
        <line x1="20" y1="40" x2="46" y2="40" strokeWidth="1.2" opacity="0.45" />
        <line x1="20" y1="46" x2="38" y2="46" strokeWidth="1.2" opacity="0.45" />
        {/* Tiny client avatar dot */}
        <circle cx="22" cy="55" r="2" />
        <line x1="28" y1="55" x2="44" y2="55" strokeWidth="1.2" opacity="0.45" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2. Programs — central program card surrounded by twinkling sparkles.
// ─────────────────────────────────────────────────────────────────────
export function ProgramsIllustration({ className }: IllustrationProps) {
  // Four-point sparkle path (cross shape)
  const sparklePath = 'M 0 -5 L 1.2 -1.2 L 5 0 L 1.2 1.2 L 0 5 L -1.2 1.2 L -5 0 L -1.2 -1.2 Z';
  const sparkles = [
    { x: 18, y: 18, delay: 0,   scale: 0.9 },
    { x: 62, y: 22, delay: 0.7, scale: 0.7 },
    { x: 64, y: 58, delay: 1.4, scale: 1   },
    { x: 16, y: 60, delay: 2.1, scale: 0.6 },
  ];

  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Central program card */}
      <rect x="26" y="26" width="28" height="28" rx="3.5" />
      <line x1="32" y1="34" x2="48" y2="34" strokeWidth="1.2" opacity="0.5" />
      <line x1="32" y1="40" x2="44" y2="40" strokeWidth="1.2" opacity="0.5" />
      <line x1="32" y1="46" x2="46" y2="46" strokeWidth="1.2" opacity="0.5" />

      {/* Sparkles twinkling */}
      {sparkles.map((s, i) => (
        <motion.path
          key={i}
          d={sparklePath}
          fill="currentColor"
          stroke="none"
          style={{ transformOrigin: `${s.x}px ${s.y}px` }}
          transform={`translate(${s.x} ${s.y}) scale(${s.scale})`}
          initial={{ opacity: 0.2 }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [s.scale * 0.7, s.scale, s.scale * 0.7] }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: s.delay,
          }}
        />
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 3. Analytics — bar chart with a line overlay; bars cycle heights.
// ─────────────────────────────────────────────────────────────────────
export function AnalyticsIllustration({ className }: IllustrationProps) {
  const bars = [
    { x: 14, baseH: 14, peakH: 22 },
    { x: 24, baseH: 22, peakH: 30 },
    { x: 34, baseH: 18, peakH: 26 },
    { x: 44, baseH: 30, peakH: 38 },
    { x: 54, baseH: 26, peakH: 34 },
    { x: 64, baseH: 36, peakH: 44 },
  ];
  const BAR_W = 5;
  const BAR_BASE_Y = 60;

  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Axis */}
      <line x1="10" y1="60" x2="72" y2="60" strokeWidth="1" opacity="0.35" />

      {/* Bars - height eases between base and peak forever */}
      {bars.map((b, i) => (
        <motion.rect
          key={i}
          x={b.x}
          width={BAR_W}
          rx="1"
          fill="currentColor"
          stroke="none"
          initial={{ y: BAR_BASE_Y - b.baseH, height: b.baseH, opacity: 0.5 + i * 0.06 }}
          animate={{
            y: [BAR_BASE_Y - b.baseH, BAR_BASE_Y - b.peakH, BAR_BASE_Y - b.baseH],
            height: [b.baseH, b.peakH, b.baseH],
          }}
          transition={{
            duration: 2.4 + (i % 3) * 0.4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.18,
          }}
        />
      ))}

      {/* Line overlay tracing the peaks */}
      <motion.polyline
        points="16,38 26,30 36,34 46,22 56,26 66,16"
        strokeWidth="1.4"
        opacity="0.7"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* End dot */}
      <circle cx="66" cy="16" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 4. Billing — invoice document with ₹ + animated checkmark.
// ─────────────────────────────────────────────────────────────────────
export function BillingIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Document body with folded top-right corner */}
      <path d="M 20 14 L 54 14 L 60 20 L 60 64 L 20 64 Z" />
      <path d="M 54 14 L 54 20 L 60 20" opacity="0.55" />

      {/* ₹ symbol top-left */}
      <text
        x="26"
        y="28"
        fontFamily="ui-sans-serif, system-ui"
        fontSize="9"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
      >
        ₹
      </text>
      {/* Amount placeholder line next to ₹ */}
      <line x1="34" y1="26" x2="48" y2="26" strokeWidth="1.4" opacity="0.55" />

      {/* Body lines */}
      <line x1="26" y1="36" x2="54" y2="36" strokeWidth="1.2" opacity="0.4" />
      <line x1="26" y1="42" x2="48" y2="42" strokeWidth="1.2" opacity="0.4" />
      <line x1="26" y1="48" x2="52" y2="48" strokeWidth="1.2" opacity="0.4" />

      {/* Checkmark badge bottom-right - draws on hover */}
      <circle cx="54" cy="56" r="6" opacity="0.5" />
      <motion.path
        d="M 51 56 L 53.5 58.5 L 58 53"
        strokeWidth="1.8"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 5. Voice AI — microphone with rippling sound rings.
// ─────────────────────────────────────────────────────────────────────
export function VoiceIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Mic capsule */}
      <rect x="34" y="22" width="12" height="22" rx="6" />
      {/* Mic stem */}
      <path d="M 40 44 L 40 54" />
      <path d="M 30 54 L 50 54" />
      {/* Mic boundary (the U shape catching the capsule) */}
      <path d="M 28 36 Q 28 50 40 50 Q 52 50 52 36" opacity="0.55" />

      {/* Sound rings rippling outward */}
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i}
          cx="40"
          cy="36"
          r="14"
          opacity="0"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.7], opacity: [0, 0.5, 0] }}
          transition={{
            duration: 2.4,
            repeat: Infinity,
            ease: 'easeOut',
            delay: i * 0.8,
          }}
          style={{ transformOrigin: '40px 36px' }}
        />
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 6. Plate Vision — viewfinder brackets around a plate; scanline sweeps.
// ─────────────────────────────────────────────────────────────────────
export function VisionIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Viewfinder corner brackets (L shapes at each corner of an imaginary 14..66 box) */}
      <path d="M 14 22 L 14 14 L 22 14" />
      <path d="M 58 14 L 66 14 L 66 22" />
      <path d="M 66 58 L 66 66 L 58 66" />
      <path d="M 22 66 L 14 66 L 14 58" />

      {/* Plate (circle) */}
      <circle cx="40" cy="40" r="18" opacity="0.7" />
      {/* Inner plate ring */}
      <circle cx="40" cy="40" r="13" strokeWidth="1" opacity="0.35" />

      {/* "Detected food" dots */}
      <circle cx="34" cy="36" r="2.4" fill="currentColor" stroke="none" opacity="0.7" />
      <circle cx="46" cy="38" r="2.0" fill="currentColor" stroke="none" opacity="0.7" />
      <circle cx="40" cy="46" r="2.6" fill="currentColor" stroke="none" opacity="0.7" />

      {/* Scanline sweeping down */}
      <motion.line
        x1="18"
        x2="62"
        strokeWidth="1.2"
        opacity="0.7"
        initial={{ y1: 22, y2: 22 }}
        animate={{ y1: [22, 58, 22], y2: [22, 58, 22] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 7. Appointments — calendar with a pulsing video-call badge.
// ─────────────────────────────────────────────────────────────────────
export function AppointmentsIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Calendar body + header rule */}
      <rect x="16" y="20" width="48" height="42" rx="4" />
      <line x1="16" y1="30" x2="64" y2="30" strokeWidth="1.2" opacity="0.5" />
      {/* Hangers */}
      <line x1="28" y1="16" x2="28" y2="24" />
      <line x1="52" y1="16" x2="52" y2="24" />

      {/* Date dots */}
      {[38, 46].map((cy) =>
        [24, 32, 40].map((cx) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r="1.8"
            fill="currentColor"
            stroke="none"
            opacity="0.4"
          />
        )),
      )}

      {/* Video-call badge - pulsing ring + play triangle */}
      <motion.circle
        cx="52"
        cy="50"
        r="9"
        initial={{ scale: 1, opacity: 0.6 }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.15, 0.6] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '52px 50px' }}
      />
      <circle cx="52" cy="50" r="7" opacity="0.9" />
      <path d="M 49.5 46.5 L 49.5 53.5 L 55.5 50 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 8. Messaging — two chat bubbles; the incoming one shows typing dots.
// ─────────────────────────────────────────────────────────────────────
export function MessagingIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Outgoing bubble (behind, lower-right) */}
      <rect x="34" y="40" width="34" height="22" rx="8" opacity="0.4" />
      <line x1="40" y1="48" x2="62" y2="48" strokeWidth="1.2" opacity="0.4" />
      <line x1="40" y1="54" x2="55" y2="54" strokeWidth="1.2" opacity="0.4" />

      {/* Incoming bubble (front, upper-left) */}
      <rect x="12" y="18" width="38" height="24" rx="9" />
      {/* Typing dots pulsing in sequence */}
      {[23, 31, 39].map((cx, i) => (
        <motion.circle
          key={cx}
          cx={cx}
          cy="30"
          r="2.4"
          fill="currentColor"
          stroke="none"
          initial={{ opacity: 0.25 }}
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
        />
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 9. Client app — a phone with a plan on screen + pulsing notification.
// ─────────────────────────────────────────────────────────────────────
export function ClientAppIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 80 80" className={className} {...SHARED_PROPS}>
      {/* Phone body + screen */}
      <rect x="26" y="10" width="28" height="60" rx="6" />
      <rect x="30" y="18" width="20" height="44" rx="2" opacity="0.5" />
      {/* Speaker + home indicator */}
      <line x1="37" y1="14" x2="43" y2="14" strokeWidth="1.6" />
      <line x1="36" y1="66" x2="44" y2="66" strokeWidth="1.6" opacity="0.6" />

      {/* On-screen content - header chip + plan lines */}
      <rect x="33" y="22" width="13" height="5" rx="1.5" fill="currentColor" stroke="none" opacity="0.45" />
      {[34, 40, 46, 52].map((y, i) => (
        <line
          key={y}
          x1="33"
          y1={y}
          x2={i % 2 === 0 ? 47 : 43}
          y2={y}
          strokeWidth="1.2"
          opacity="0.4"
        />
      ))}

      {/* Push notification badge - pulses to say "your clients get pinged" */}
      <motion.circle
        cx="52"
        cy="16"
        r="4"
        fill="currentColor"
        stroke="none"
        initial={{ scale: 1, opacity: 0.7 }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '52px 16px' }}
      />
    </svg>
  );
}