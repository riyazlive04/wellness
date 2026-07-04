import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, X, Sparkles, Loader2, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';

import { clientsApi, type VoiceConverseResult } from '@/modules/workspace/api/clients';
import { useMicRecorder } from '@/modules/workspace/voice-ai/useMicRecorder';
import { speak, stopSpeaking } from '@/modules/workspace/voice-ai/speak';
import { cn } from '@/lib/utils';

interface Turn {
  kind: 'you' | 'sirah';
  text: string;
}

/**
 * FloatingVoiceAssistant — SIRAH's always-available voice companion.
 *
 * A floating mic button anchored bottom-right on every client page. Tap to open
 * a compact chat panel (bottom-sheet on mobile, anchored card on desktop), tap
 * the mic and talk; it auto-stops on silence (VAD), transcribes + answers via
 * POST /voice/converse, shows the exchange as chat bubbles, and speaks the reply
 * aloud with browser TTS.
 *
 * Reuses the existing voice stack (useMicRecorder, speak, clientsApi.voiceConverse)
 * so there's a single source of truth for voice behaviour across the app.
 */
export function FloatingVoiceAssistant() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const converse = useMutation<VoiceConverseResult, Error, File>({
    mutationFn: (f) => clientsApi.voiceConverse(f),
    onSuccess: (data) => {
      setTurns((prev) => [
        ...prev,
        { kind: 'you', text: data.userTranscript },
        { kind: 'sirah', text: data.aiResponse },
      ]);
      if (!mutedRef.current) speak(data.aiResponse);
      // A voice action may have logged a meal / journal entry — refresh data.
      if (data.intent?.kind === 'meal_log') {
        const resolved = data.intent.foods.filter((f) => f.resolved).length;
        if (resolved > 0) {
          toast.success(`Logged ${resolved} item${resolved === 1 ? '' : 's'} by voice`);
          qc.invalidateQueries({ queryKey: ['me'] });
        }
      }
    },
    onError: (err) => toast.error(err.message ?? 'Could not process that. Try again.'),
  });

  const send = (blob: Blob | null) => {
    if (!blob || blob.size === 0) return;
    converse.mutate(new File([blob], `voice-${blob.size}.webm`, { type: blob.type || 'audio/webm' }));
  };

  const recorder = useMicRecorder({ onAutoStop: send });
  const listening = recorder.status === 'recording';
  const pending = converse.isPending;

  async function toggleMic() {
    if (listening) {
      const blob = await recorder.stop(); // manual stop → onAutoStop won't fire
      send(blob);
    } else {
      stopSpeaking();
      await recorder.start();
    }
  }

  // Auto-scroll the thread to the newest turn.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, pending]);

  // Stop any speech / recording when the panel closes.
  useEffect(() => {
    if (!open) {
      stopSpeaking();
      if (recorder.status === 'recording') recorder.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      {/* Launcher — single global floating object, bottom-right, above bottom nav. */}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            key="voice-fab"
            onClick={() => setOpen(true)}
            aria-label="Open voice assistant"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className={cn(
              'no-select touch-target fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full text-white shadow-xl',
              'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] shadow-fuchsia-500/30',
              'bottom-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom)+1rem)] md:bottom-6',
            )}
          >
            <Mic className="h-6 w-6" />
            <span className="absolute inset-0 -z-10 rounded-full bg-fuchsia-500/30 blur-md" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Scrim (mobile only) */}
            <motion.div
              key="voice-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden"
            />
            <motion.section
              key="voice-panel"
              role="dialog"
              aria-label="Voice assistant"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className={cn(
                'fixed z-50 flex flex-col overflow-hidden border border-foreground/[0.08] bg-canvas/95 shadow-2xl backdrop-blur-xl',
                // Mobile: bottom sheet. Desktop: anchored card bottom-right.
                'inset-x-0 bottom-0 max-h-[82vh] rounded-t-3xl',
                'md:inset-x-auto md:bottom-6 md:right-6 md:h-[34rem] md:max-h-[80vh] md:w-[24rem] md:rounded-3xl',
              )}
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {/* Header */}
              <header className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">SIRAH Voice</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">
                      {listening ? 'Listening…' : pending ? 'Thinking…' : 'Tap the mic to talk'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setMuted((m) => !m); stopSpeaking(); }}
                    aria-label={muted ? 'Unmute replies' : 'Mute replies'}
                    className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.05]"
                  >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.05]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {/* Thread */}
              <div ref={threadRef} className="momentum-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {turns.length === 0 && !pending && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-foreground/55">
                    <Sparkles className="h-6 w-6 text-violet-500" />
                    <p className="px-6 text-sm">
                      Try <em>"I had dal and rice for lunch"</em> or <em>"How am I doing this week?"</em>
                    </p>
                  </div>
                )}
                {turns.map((t, i) => (
                  <div key={i} className={cn('flex', t.kind === 'you' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                        t.kind === 'you'
                          ? 'bg-gradient-to-br from-blue-500/15 to-fuchsia-500/10 text-foreground'
                          : 'bg-foreground/[0.05] text-foreground',
                      )}
                    >
                      {t.kind === 'sirah' && (
                        <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
                          <Sparkles className="h-2.5 w-2.5" /> SIRAH
                        </div>
                      )}
                      {t.text}
                    </div>
                  </div>
                ))}
                {pending && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl bg-foreground/[0.05] px-3.5 py-2.5 text-sm text-foreground/65">
                      <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Thinking…
                    </div>
                  </div>
                )}
              </div>

              {/* Mic control */}
              <div className="flex flex-col items-center gap-2 border-t border-foreground/[0.06] px-4 py-4">
                <button
                  type="button"
                  disabled={pending}
                  onClick={toggleMic}
                  aria-label={listening ? 'Stop and send' : 'Start talking'}
                  className={cn(
                    'relative grid h-16 w-16 place-items-center rounded-full text-white transition-all',
                    'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] shadow-[0_14px_40px_-12px_rgba(99,102,241,0.7)]',
                    listening && 'scale-105',
                    pending && 'opacity-50',
                  )}
                >
                  {listening ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
                  {listening && (
                    <span
                      className="absolute inset-0 rounded-full ring-2 ring-fuchsia-400/60"
                      style={{ transform: `scale(${1 + Math.min(0.4, recorder.level * 3)})` }}
                    />
                  )}
                </button>
                <div className="text-[11px] text-foreground/55">
                  {recorder.status === 'unsupported'
                    ? 'Voice not supported on this browser'
                    : recorder.status === 'denied'
                      ? 'Microphone blocked — enable it in settings'
                      : listening
                        ? 'Listening… tap to send'
                        : pending
                          ? 'Processing…'
                          : 'Tap to speak'}
                </div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
