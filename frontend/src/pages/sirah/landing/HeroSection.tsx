import { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  ArrowRight,
  AudioLines,
  BarChart3,
  Building2,
  CalendarRange,
  Camera,
  TrendingUp,
  UserCircle2,
} from 'lucide-react';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { cn } from '@/lib/utils';

/**
 * SIRAH LIFE — Interactive Wellness Ecosystem hero.
 *
 * Two-column layout:
 *  - Left: headline + subhead + CTAs + trust strip
 *  - Right: a hex-layout ecosystem with a central Workspace node and six
 *    orbit nodes (Client / Programs / Voice / Vision / Analytics / Growth)
 *
 * Interaction model:
 *  - Mouse parallax: each node translates by `depth * mouse-offset`, smoothed
 *    by a spring. Nodes further from the viewer (higher depth) move more,
 *    creating a depth-of-field feel without 3D.
 *  - Floating loop: every node has its own gentle Y oscillation with a phase
 *    offset, so the cluster breathes rather than marches.
 *  - Hover: the card scales up, the accent ring brightens, and the detail
 *    flourish (waveform / macro pills / mini bars) fades in.
 *  - Connections: curved Bezier paths from the centre to each node, drawn
 *    on a single SVG layer behind everything; a slow stroke-dashoffset
 *    sweep gives the lines a "data flowing inward" feel.
 *
 * Reduced-motion users still see the layout and the hover affordances;
 * `prefers-reduced-motion` is respected by framer's defaults — the floats
 * and stroke sweeps are decorative, not load-bearing.
 */

type Accent = 'blue' | 'cyan' | 'violet';

interface OrbitNodeData {
  id: string;
  label: string;
  icon: typeof AudioLines;
  accent: Accent;
  /** Position on a circle in degrees. 0° = right, increases counter-clockwise. */
  angle: number;
  /** Depth multiplier for parallax (1.0–1.5). Higher = moves more on mouse. */
  depth: number;
  preview: { label: string; value: string };
  /** Optional decorative detail revealed on hover. */
  detail?: 'waveform' | 'macros' | 'bars' | null;
}

const ORBIT_NODES: OrbitNodeData[] = [
  {
    id: 'voice',
    label: 'Voice AI',
    icon: AudioLines,
    accent: 'violet',
    angle: 90, // top
    depth: 1.4,
    preview: { label: 'Listening', value: '"What did you eat for lunch?"' },
    detail: 'waveform',
  },
  {
    id: 'vision',
    label: 'Plate Vision',
    icon: Camera,
    accent: 'cyan',
    angle: 30, // top-right
    depth: 1.2,
    preview: { label: 'Detected', value: 'Dal · Rice · Salad' },
    detail: 'macros',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    accent: 'blue',
    angle: 330, // bottom-right
    depth: 1.3,
    preview: { label: 'MRR', value: '+18.2% MoM' },
    detail: 'bars',
  },
  {
    id: 'growth',
    label: 'Wellness Score',
    icon: TrendingUp,
    accent: 'violet',
    angle: 270, // bottom
    depth: 1.4,
    preview: { label: 'Score', value: '78 / 100 · trending up' },
    detail: null,
  },
  {
    id: 'programs',
    label: 'Programs',
    icon: CalendarRange,
    accent: 'cyan',
    angle: 210, // bottom-left
    depth: 1.2,
    preview: { label: 'Active', value: '4 programs running' },
    detail: null,
  },
  {
    id: 'client',
    label: 'Clients',
    icon: UserCircle2,
    accent: 'blue',
    angle: 150, // top-left
    depth: 1.3,
    preview: { label: 'Priya · day 14', value: 'On track · 91% adherence' },
    detail: null,
  },
];

const ORBIT_RADIUS = 38; // % of container — used by both layout + SVG paths

function polarToPercent(angle: number, r = ORBIT_RADIUS) {
  const rad = (angle * Math.PI) / 180;
  return { x: 50 + r * Math.cos(rad), y: 50 - r * Math.sin(rad) };
}

const ACCENT_CLASSES: Record<Accent, {
  bg: string; ring: string; text: string; dot: string; glow: string;
}> = {
  blue: {
    bg: 'from-blue-500/15 to-blue-500/0',
    ring: 'ring-blue-400/30',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-400',
    glow: 'shadow-[0_18px_40px_-20px_rgba(59,130,246,0.45)]',
  },
  cyan: {
    bg: 'from-cyan-500/15 to-cyan-500/0',
    ring: 'ring-cyan-400/30',
    text: 'text-cyan-700 dark:text-cyan-300',
    dot: 'bg-cyan-400',
    glow: 'shadow-[0_18px_40px_-20px_rgba(34,211,238,0.4)]',
  },
  violet: {
    bg: 'from-violet-500/15 to-violet-500/0',
    ring: 'ring-violet-400/30',
    text: 'text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-400',
    glow: 'shadow-[0_18px_40px_-20px_rgba(139,92,246,0.45)]',
  },
};

// ─────────────────────────────────────────────────────────────────────
// HeroSection
// ─────────────────────────────────────────────────────────────────────

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  // Critically-damped spring — feels heavy, premium, never overshoots.
  const smoothX = useSpring(mouseX, { stiffness: 60, damping: 22, mass: 0.6 });
  const smoothY = useSpring(mouseY, { stiffness: 60, damping: 22, mass: 0.6 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Normalised offset from centre, ranging roughly -0.5..0.5
    mouseX.set((e.clientX - rect.left - rect.width / 2) / rect.width);
    mouseY.set((e.clientY - rect.top - rect.height / 2) / rect.height);
  }
  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-24 pt-10 md:px-10 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32 lg:pt-20"
    >
      {/* ── Text column ─────────────────────────────────────────────── */}
      <motion.div
        variants={stagger(0.08, 0.06)}
        initial="initial"
        animate="animate"
        className="relative flex flex-col items-start"
      >
        <motion.div variants={fadeUp}>
          <Glass
            variant="subtle"
            className="inline-flex items-center gap-2.5 rounded-full border-foreground/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] text-foreground/70"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
            </span>
            AI Wellness OS · for healthcare teams
          </Glass>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-7 max-w-2xl text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[4.3rem]"
        >
          The{' '}
          <span className="bg-gradient-to-br from-blue-600 via-violet-500 to-cyan-400 bg-clip-text text-transparent">
            AI Wellness
          </span>
          <br />
          Operating System
          <br />
          <span className="text-foreground/55">for modern healthcare businesses.</span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-foreground/70 md:mt-7 md:text-lg"
        >
          Manage clients, wellness programs, AI meal plans, voice coaching, plate-vision analysis,
          automation, and business growth — from a single calm platform.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center md:mt-10"
        >
          <AIGlow intensity="default" animated>
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-7 py-3.5 text-sm font-medium text-white transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </AIGlow>
          <a
            href="mailto:support@sirahdigital.in?subject=SIRAH%20LIFE%20demo%20request"
            className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-white/40 px-7 py-3.5 text-sm text-foreground/80 backdrop-blur transition-colors hover:bg-foreground/[0.04] dark:bg-foreground/[0.03]"
          >
            Book a demo
            <ArrowRight className="h-3.5 w-3.5 opacity-50 transition-transform group-hover:translate-x-0.5" />
          </a>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-foreground/55"
        >
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            30-day free trial
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-violet-500" />
            No card required
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-cyan-500" />
            DPDP-ready
          </span>
        </motion.div>
      </motion.div>

      {/* ── Ecosystem column ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="relative mx-auto aspect-square w-full max-w-[560px]"
      >
        <Ecosystem mouseX={smoothX} mouseY={smoothY} />
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Ecosystem viz
// ─────────────────────────────────────────────────────────────────────

function Ecosystem({
  mouseX,
  mouseY,
}: {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  return (
    <div className="relative h-full w-full">
      {/* Soft halo behind the centre — tinted with the brand triad. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-blue-500/10 via-violet-500/8 to-cyan-400/10 blur-3xl" />

      {/* Two concentric guide rings — barely visible, give the eye structure. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/[0.06]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-foreground/[0.05]"
      />

      <ConnectionLines />
      <CenterNode mouseX={mouseX} mouseY={mouseY} />
      {ORBIT_NODES.map((n, i) => (
        <OrbitNode key={n.id} data={n} index={i} mouseX={mouseX} mouseY={mouseY} />
      ))}
    </div>
  );
}

function ConnectionLines() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sirah-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.0)" />
          <stop offset="50%" stopColor="rgba(99,102,241,0.55)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0.0)" />
        </linearGradient>
      </defs>
      {ORBIT_NODES.map((n, i) => {
        const { x, y } = polarToPercent(n.angle);
        // Curve control point — perpendicular offset on the midpoint
        // gives each line a subtle arc rather than a straight ruler.
        const mx = (50 + x) / 2 + Math.cos((n.angle * Math.PI) / 180 + Math.PI / 2) * 5;
        const my = (50 + y) / 2 - Math.sin((n.angle * Math.PI) / 180 + Math.PI / 2) * 5;
        return (
          <motion.path
            key={n.id}
            d={`M 50 50 Q ${mx} ${my} ${x} ${y}`}
            fill="none"
            stroke="url(#sirah-line)"
            strokeWidth={0.45}
            strokeLinecap="round"
            strokeDasharray="2 3"
            initial={{ opacity: 0, strokeDashoffset: 0 }}
            animate={{
              opacity: 0.7,
              // Marching dashes carry the eye outward from the hub.
              strokeDashoffset: [0, -5],
            }}
            transition={{
              opacity: { delay: 0.4 + i * 0.08, duration: 0.9 },
              strokeDashoffset: {
                delay: 0.4 + i * 0.08,
                duration: 2.4 + i * 0.15,
                repeat: Infinity,
                ease: 'linear',
              },
            }}
          />
        );
      })}
    </svg>
  );
}

function CenterNode({
  mouseX,
  mouseY,
}: {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  // Hub moves least — depth 0.5 — anchoring the rest visually.
  const x = useTransform(mouseX, (v) => v * 12);
  const y = useTransform(mouseY, (v) => v * 12);

  return (
    <motion.div
      style={{ x, y }}
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <AIGlow intensity="strong" animated>
          <div className="relative grid h-32 w-32 place-items-center rounded-3xl border border-white/30 bg-white/75 shadow-[0_30px_70px_-25px_rgba(99,102,241,0.45)] backdrop-blur-xl dark:bg-foreground/[0.06]">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-500/10 via-violet-500/10 to-cyan-400/10" />
            <div className="relative flex flex-col items-center gap-1.5">
              <Building2 className="h-7 w-7 text-foreground" strokeWidth={1.5} />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-foreground/75">
                Workspace
              </span>
              <span className="text-[9px] text-foreground/45">SIRAH OS</span>
            </div>
          </div>
        </AIGlow>
      </motion.div>
    </motion.div>
  );
}

function OrbitNode({
  data,
  index,
  mouseX,
  mouseY,
}: {
  data: OrbitNodeData;
  index: number;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  const { x: posX, y: posY } = polarToPercent(data.angle);
  const accent = ACCENT_CLASSES[data.accent];

  // Mouse parallax — outer wrapper moves the node along the cursor vector,
  // scaled by depth so back-row cards travel further than front-row.
  const px = useTransform(mouseX, (v) => v * 32 * data.depth);
  const py = useTransform(mouseY, (v) => v * 32 * data.depth);

  // Phase offset so cards don't bob in unison.
  const phase = (index * 2 * Math.PI) / ORBIT_NODES.length;
  const floatY = Math.sin(phase) * 4;

  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${posX}%`, top: `${posY}%`, x: px, y: py }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: [floatY, floatY - 5, floatY, floatY + 3, floatY],
        }}
        transition={{
          opacity: {
            delay: 0.5 + index * 0.08,
            duration: 0.7,
            ease: [0.16, 1, 0.3, 1],
          },
          scale: {
            delay: 0.5 + index * 0.08,
            duration: 0.7,
            ease: [0.16, 1, 0.3, 1],
          },
          y: {
            delay: 1.3,
            duration: 6 + index * 0.5,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
        whileHover={{ scale: 1.06, transition: { duration: 0.25 } }}
        className={cn(
          'group relative flex min-w-[140px] flex-col gap-2 rounded-2xl border border-white/30 bg-white/80 p-3.5 backdrop-blur-xl ring-1 transition-shadow dark:bg-foreground/[0.05]',
          accent.ring,
          accent.glow,
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br ring-1 ring-inset ring-white/40',
              accent.bg,
            )}
          >
            <data.icon className={cn('h-3.5 w-3.5', accent.text)} strokeWidth={1.75} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/85">
            {data.label}
          </span>
        </div>

        <div className="text-[10px]">
          <div className="uppercase tracking-[0.16em] text-foreground/40">
            {data.preview.label}
          </div>
          <div className="mt-0.5 font-medium text-foreground/85">{data.preview.value}</div>
        </div>

        {data.detail === 'waveform' && (
          <div className="flex h-4 items-end gap-[2px] opacity-60 transition-opacity group-hover:opacity-100">
            {[3, 6, 9, 12, 8, 5, 10, 14, 7, 4, 8, 11].map((h, i) => (
              <motion.span
                key={i}
                className={cn('w-[2px] rounded-full', accent.dot)}
                initial={{ height: 2 }}
                animate={{ height: [2, h, 2] }}
                transition={{
                  duration: 0.9 + (i % 3) * 0.18,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.04,
                }}
              />
            ))}
          </div>
        )}
        {data.detail === 'macros' && (
          <div className="flex flex-wrap gap-1 text-[9px]">
            <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-foreground/75">
              412 kcal
            </span>
            <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-foreground/75">
              24g protein
            </span>
            <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-foreground/75">
              58g carbs
            </span>
          </div>
        )}
        {data.detail === 'bars' && (
          <div className="flex h-5 items-end gap-1">
            {[40, 65, 55, 80, 72, 90, 85].map((h, i) => (
              <span
                key={i}
                className={cn('w-1 rounded-sm', accent.dot)}
                style={{ height: `${h}%`, opacity: 0.4 + i * 0.085 }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}