import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Sparkles, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { GradientOrb, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { VoiceOrb } from '@/modules/workspace/voice-ai/components/VoiceOrb';
import { Transcript } from '@/modules/workspace/voice-ai/components/Transcript';
import { MealPreview } from '@/modules/workspace/voice-ai/components/MealPreview';
import { CONVERSATIONS } from '@/modules/workspace/voice-ai/data/conversations';
import type { Conversation, Intent, VoiceState } from '@/modules/workspace/voice-ai/types';
import { useMicRecorder } from '@/modules/workspace/voice-ai/useMicRecorder';
import { converse, type VoiceConverseResponse } from '@/modules/workspace/voice-ai/api';
import { speak, stopSpeaking } from '@/modules/workspace/voice-ai/speak';

const STATE_LABEL: Record<VoiceState, string> = {
  idle:       'Tap to talk · or pick a sample below',
  listening:  'Listening… tap again to stop',
  processing: 'Understanding…',
  responding: 'SIRAH is responding',
  done:       'Try another or tap to talk again',
};

interface LiveExchange {
  userText: string;
  aiText: string;
  intent?: VoiceConverseResponse['intent'];
}

export default function OwnerVoiceAI() {
  const workspace = readWorkspace();
  const [state, setState] = useState<VoiceState>('idle');
  /** Either a canned conversation (sample chip) OR live exchange (mic). */
  const [active, setActive] = useState<Conversation | null>(null);
  const [live, setLive] = useState<LiveExchange | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);

  const mic = useMicRecorder();
  const timers = useRef<number[]>([]);

  // Cleanup any running timers + TTS on unmount.
  useEffect(() => () => { clearAll(); stopSpeaking(); }, []);
  function clearAll() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }
  function schedule(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  // ─── Sample (canned) path — preserved for demo without mic ─────────────
  function runSample(conv: Conversation) {
    clearAll();
    stopSpeaking();
    setActive(conv);
    setLive(null);
    setIntent(null);
    setState('listening');

    const userMs = Math.max(1500, conv.userText.length * 22 + 600);
    schedule(() => setState('processing'), userMs);
    schedule(() => {
      setState('responding');
      setIntent(conv.intent);
      if (conv.intent.kind !== 'meal_log') speak(conv.intent.reply);
    }, userMs + 1400);
    schedule(() => setState('done'), userMs + 5200);
  }

  // ─── Real mic path ──────────────────────────────────────────────────────
  async function startTalking() {
    clearAll();
    stopSpeaking();
    setActive(null);
    setLive(null);
    setIntent(null);
    await mic.start();
    if (mic.status === 'denied') {
      toast.error('Microphone permission denied. Allow it in your browser settings.');
      setState('idle');
      return;
    }
    if (mic.status === 'unsupported') {
      toast.error('Your browser doesn\'t support audio recording.');
      setState('idle');
      return;
    }
    setState('listening');
  }

  async function stopAndSend() {
    const blob = await mic.stop();
    if (!blob || blob.size === 0) {
      toast('No audio captured.');
      setState('idle');
      return;
    }
    setState('processing');
    try {
      const result = await converse(blob);
      setLive({
        userText: result.userTranscript,
        aiText:   result.aiResponse,
        intent:   result.intent,
      });
      setState('responding');
      speak(result.aiResponse);
      // Give the user a beat to read; mark done after the reply finishes.
      schedule(() => setState('done'), Math.max(3500, result.aiResponse.length * 60));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Voice request failed.';
      toast.error(msg);
      setState('idle');
    }
  }

  function reset() {
    clearAll();
    stopSpeaking();
    mic.reset();
    setActive(null);
    setLive(null);
    setIntent(null);
    setState('idle');
  }

  function logMeal() {
    toast.success('Meal logged. (Wires to /api/v1/meal_logs once that module lands.)');
    reset();
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  const showTranscript =
    (active && state !== 'idle') ||
    (live && state !== 'idle');

  const userText = live ? live.userText : active?.userText ?? '';
  const aiText   = live
    ? (state === 'responding' || state === 'done' ? live.aiText : undefined)
    : active && (state === 'responding' || state === 'done')
      ? (active.intent.kind === 'meal_log'
          ? 'Got it — here\'s what I heard. Tap Log this meal when it looks right.'
          : active.intent.reply)
      : undefined;

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext="Voice AI · Gemini 2.0 multimodal"
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="relative min-h-[calc(100vh-64px)] overflow-hidden">
        <GradientOrb color="blue"    size={560} position="top-0 -left-32" />
        <GradientOrb color="magenta" size={460} position="bottom-0 -right-20" delay={2} driftDuration={22} />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-10 md:py-14">
          <motion.div
            variants={stagger(0.06, 0.05)}
            initial="initial"
            animate="animate"
            className="w-full text-center"
          >
            <motion.div variants={fadeUp}>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-violet-200">
                <Sparkles className="h-3 w-3" />
                Voice AI
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Talk to SIRAH.
              </h1>
              <p className="mt-1 text-sm text-foreground/55">
                Log a meal, reflect on your day, ask a question. SIRAH listens, understands, and acts.
              </p>
            </motion.div>

            {/* Orb + state label */}
            <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center">
              <VoiceOrb state={state} size={320} />
              <div className="mt-4 text-xs uppercase tracking-[0.18em] text-foreground/50">
                {STATE_LABEL[state]}
              </div>
            </motion.div>

            {/* Mic button — real recording */}
            <motion.div variants={fadeUp} className="mt-8 flex justify-center">
              <MicButton
                state={state}
                onStart={startTalking}
                onStop={stopAndSend}
                onReset={reset}
              />
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
                  <div className="mb-3 text-xs uppercase tracking-[0.18em] text-foreground/55">
                    Try a sample prompt
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {CONVERSATIONS.map((conv) => (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => runSample(conv)}
                        className="group inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3.5 py-1.5 text-xs text-foreground/80 transition-all hover:-translate-y-0.5 hover:bg-foreground/[0.06]"
                      >
                        <span className="text-violet-300 group-hover:text-violet-200">›</span>
                        {conv.prompt}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Active transcript */}
            {showTranscript && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="mt-10 space-y-5"
              >
                <Transcript
                  userText={userText}
                  aiText={aiText}
                  showListeningHint={state === 'listening'}
                />

                {/* Meal preview only for canned samples (live API doesn't return structured items yet) */}
                {active && (state === 'responding' || state === 'done') && intent && intent.kind === 'meal_log' && (
                  <MealPreview
                    intent={intent}
                    onLog={logMeal}
                    onEdit={() => toast('Inline meal editor lands with the meal-logs module.')}
                  />
                )}

                {/* Latency / intent peek for live exchanges */}
                {live && live.intent && live.intent.kind !== 'unknown' && (state === 'responding' || state === 'done') && (
                  <div className="text-[11px] text-foreground/45">
                    Detected intent: <span className="text-violet-300">{live.intent.kind}</span>
                    {live.intent.kind === 'meal_log' && live.intent.foods.length > 0 && (
                      <> · foods: {live.intent.foods.join(', ')}</>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* Footer hint */}
            {state === 'idle' && (
              <motion.div variants={fadeUp} className="mt-10 text-[11px] text-foreground/35">
                Voice runs through Gemini 2.0 (transcription + reasoning in one call) →
                your browser's voice for playback. Audio is sent to the backend and discarded after the response.
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.04] px-4 py-2 text-xs text-foreground/80 hover:bg-foreground/[0.08]"
                >
                  <RotateCcw className="h-3 w-3" />
                  Try another
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>

        <div className="h-10" />
      </div>
    </OwnerLayout>
  );
}

// ─── Mic button ──────────────────────────────────────────────────────────

interface MicButtonProps {
  state: VoiceState;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onReset: () => void;
}

function MicButton({ state, onStart, onStop, onReset }: MicButtonProps) {
  const recording = state === 'listening';
  const busy = state === 'processing' || state === 'responding';
  const Icon = recording ? MicOff : Mic;

  function handleClick() {
    if (recording) return void onStop();
    if (busy) return void onReset();
    void onStart();
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={{ scale: 0.95 }}
      disabled={busy}
      animate={{
        boxShadow: recording
          ? [
              '0 0 32px rgba(125,190,157,0.55)',
              '0 0 48px rgba(125,190,157,0.85)',
              '0 0 32px rgba(125,190,157,0.55)',
            ]
          : '0 0 24px rgba(139,92,246,0.45)',
      }}
      transition={recording ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      className={`relative inline-flex h-16 w-16 items-center justify-center rounded-full text-white transition-colors disabled:opacity-60 ${
        recording
          ? 'bg-gradient-to-br from-emerald-400 to-emerald-500'
          : 'bg-gradient-to-br from-blue-600 to-fuchsia-500'
      }`}
      aria-label={recording ? 'Stop and send' : 'Talk'}
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
