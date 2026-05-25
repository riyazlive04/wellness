import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Sparkles, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, GradientOrb, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { VoiceOrb } from '@/modules/workspace/voice-ai/components/VoiceOrb';
import { Transcript } from '@/modules/workspace/voice-ai/components/Transcript';
import { MealPreview } from '@/modules/workspace/voice-ai/components/MealPreview';
import { CONVERSATIONS } from '@/modules/workspace/voice-ai/data/conversations';
import type { Conversation, Intent, VoiceState } from '@/modules/workspace/voice-ai/types';

const STATE_LABEL: Record<VoiceState, string> = {
  idle:       'Tap to talk · or pick a sample below',
  listening:  'Listening…',
  processing: 'Understanding…',
  responding: 'SIRAH is responding',
  done:       'Try another or tap to talk again',
};

export default function OwnerVoiceAI() {
  const workspace = readWorkspace();
  const [state, setState] = useState<VoiceState>('idle');
  const [active, setActive] = useState<Conversation | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const timers = useRef<number[]>([]);

  // Cleanup any running timers on unmount or restart
  useEffect(() => () => clearAll(), []);
  function clearAll() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }
  function schedule(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function runConversation(conv: Conversation) {
    clearAll();
    setActive(conv);
    setIntent(null);
    setState('listening');

    // Estimate user transcript reveal time (~22ms/char + small buffer)
    const userMs = Math.max(1500, conv.userText.length * 22 + 600);
    schedule(() => setState('processing'), userMs);
    schedule(() => {
      setState('responding');
      setIntent(conv.intent);
    }, userMs + 1400);
    schedule(() => setState('done'), userMs + 5200);
  }

  function reset() {
    clearAll();
    setActive(null);
    setIntent(null);
    setState('idle');
  }

  function logMeal() {
    toast.success('Meal logged. (Wires to /api/v1/meal_logs once the backend boots.)');
    reset();
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext="Voice AI · Whisper + Aura 2"
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="relative min-h-[calc(100vh-64px)] overflow-hidden">
        {/* Extra ambient orbs — this surface is more immersive than the others */}
        <GradientOrb color="blue" size={560} position="top-0 -left-32" />
        <GradientOrb color="magenta"   size={460} position="bottom-0 -right-20" delay={2} driftDuration={22} />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-10 md:py-14">
          <motion.div
            variants={stagger(0.06, 0.05)}
            initial="initial"
            animate="animate"
            className="w-full text-center"
          >
            <motion.div variants={fadeUp}>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-indigo-200">
                <Sparkles className="h-3 w-3" />
                Voice AI
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Talk to SIRAH.
              </h1>
              <p className="mt-1 text-sm text-white/55">
                Log a meal, reflect on your day, ask a question. SIRAH listens, understands, and acts.
              </p>
            </motion.div>

            {/* Orb + state label */}
            <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center">
              <VoiceOrb state={state} size={320} />
              <div className="mt-4 text-xs uppercase tracking-[0.18em] text-white/50">
                {STATE_LABEL[state]}
              </div>
            </motion.div>

            {/* Mic button */}
            <motion.div variants={fadeUp} className="mt-8 flex justify-center">
              <MicButton state={state} onClick={reset} />
            </motion.div>

            {/* Sample chips — only visible idle */}
            <AnimatePresence>
              {state === 'idle' && (
                <motion.div
                  key="samples"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.26 }}
                  className="mt-8"
                >
                  <div className="mb-3 text-xs uppercase tracking-[0.18em] text-white/40">
                    Try a sample prompt
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {CONVERSATIONS.map((conv) => (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => runConversation(conv)}
                        className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-white/80 transition-all hover:-translate-y-0.5 hover:bg-white/[0.06]"
                      >
                        <span className="text-indigo-300 group-hover:text-indigo-200">›</span>
                        {conv.prompt}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Active conversation transcript + intent rendering */}
            {active && (state !== 'idle') && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="mt-10 space-y-5"
              >
                <Transcript
                  userText={active.userText}
                  aiText={state === 'responding' || state === 'done'
                    ? (active.intent.kind === 'meal_log'
                        ? 'Got it — here\'s what I heard. Tap Log this meal when it looks right.'
                        : active.intent.reply)
                    : undefined}
                  showListeningHint={state === 'listening'}
                />

                {/* Meal preview only for meal_log intents */}
                {(state === 'responding' || state === 'done') && intent && intent.kind === 'meal_log' && (
                  <MealPreview
                    intent={intent}
                    onLog={logMeal}
                    onEdit={() => toast('Inline meal editor lands with the meal-logs module.')}
                  />
                )}
              </motion.div>
            )}

            {/* Footer hint */}
            {state === 'idle' && (
              <motion.div variants={fadeUp} className="mt-10 text-[11px] text-white/35">
                Voice runs via Whisper (speech-to-text) → SIRAH AI → Aura 2 (text-to-speech).
                Your audio is processed on the backend and never stored without consent.
              </motion.div>
            )}

            {/* Reset action when done */}
            {state === 'done' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-8"
              >
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-white/80 hover:bg-white/[0.08]"
                >
                  <RotateCcw className="h-3 w-3" />
                  Try another
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Reserve space at the bottom so the page feels grounded */}
        <div className="h-10" />
      </div>
    </OwnerLayout>
  );
}

// ─── Mic button ──────────────────────────────────────────────────────────

function MicButton({ state, onClick }: { state: VoiceState; onClick: () => void }) {
  const active = state !== 'idle' && state !== 'done';
  const Icon = active ? MicOff : Mic;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      animate={{
        boxShadow: active
          ? [
              '0 0 32px rgba(125,190,157,0.55)',
              '0 0 48px rgba(125,190,157,0.85)',
              '0 0 32px rgba(125,190,157,0.55)',
            ]
          : '0 0 24px rgba(99,102,241,0.45)',
      }}
      transition={active ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      className={`relative inline-flex h-16 w-16 items-center justify-center rounded-full text-white transition-colors ${
        active
          ? 'bg-gradient-to-br from-emerald-400 to-emerald-500'
          : 'bg-gradient-to-br from-blue-600 to-fuchsia-500'
      }`}
      aria-label={active ? 'Stop' : 'Talk'}
    >
      <Icon className="h-6 w-6" />
    </motion.button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
