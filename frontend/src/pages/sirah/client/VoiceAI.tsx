import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Sparkles, Loader2, Volume2, Utensils, NotebookPen, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type VoiceConverseResult } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Voice AI — press to talk, get back a transcript + SIRAH's reply.
 *
 * Recording uses the browser's MediaRecorder API (webm/opus by default;
 * Gemini accepts it). The backend route is POST /api/v1/voice/converse —
 * multipart upload with file under "file".
 *
 * Conversation history stays in component state for now; future iteration
 * persists to /api/v1/me/voice/history.
 */
export default function ClientVoiceAI() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const [recording, setRecording] = useState(false);
  const [conversation, setConversation] = useState<Array<{ kind: 'you' | 'sirah'; text: string; audio?: string }>>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const converseMut = useMutation<VoiceConverseResult, Error, File>({
    mutationFn: (f) => clientsApi.voiceConverse(f),
    onSuccess: (data) => {
      setConversation((prev) => [
        ...prev,
        { kind: 'you',   text: data.userTranscript },
        { kind: 'sirah', text: data.aiResponse },
      ]);
      // Phase 2: nutrition comes from the engine, not from Gemini. When the
      // intent is meal_log, summarise the resolved foods + total kcal so the
      // user sees the actual database-grounded numbers.
      if (data.intent?.kind === 'meal_log') {
        const resolved = data.intent.foods.filter((f) => f.resolved);
        const totalKcal = Math.round(
          resolved.reduce((s, f) => s + (f.nutrients?.energy_kcal ?? 0), 0),
        );
        if (resolved.length > 0) {
          toast.success(
            `Logged ${resolved.length} food${resolved.length === 1 ? '' : 's'} · ${totalKcal} kcal`,
          );
        }
        const unresolved = data.intent.foods.length - resolved.length;
        if (unresolved > 0) {
          toast.warning(
            `${unresolved} item${unresolved === 1 ? '' : 's'} need${unresolved === 1 ? 's' : ''} clarification`,
          );
        }
      }
    },
    onError: (err) => toast.error(err.message ?? 'Could not process audio. Try again.'),
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        stream.getTracks().forEach((t) => t.stop());
        converseMut.mutate(file);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) {
      toast.error('Microphone permission denied. Enable it in your browser settings.');
      console.error('[voice-ai] mic error', err);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  const pending = converseMut.isPending;

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto w-full max-w-5xl space-y-7 px-5 py-8 md:px-8 md:py-10"
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">AI · Voice</span>
          <h1 className="mt-1 text-balance text-3xl font-semibold tracking-tight md:text-4xl">Just say it.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65 md:text-base">
            Log meals, jot a journal entry, ask a question — SIRAH listens and answers back.
          </p>
        </motion.div>

        {/* ── Main column (recorder + thread) + side panel ────────── */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Recorder + conversation — the focus */}
          <Glass className="flex flex-col overflow-hidden lg:col-span-2">
            {/* Mic — floating, big, satisfying */}
            <div className="flex flex-col items-center border-b border-foreground/[0.06] px-6 py-8">
              <AIGlow intensity={recording ? 'strong' : 'medium'} animated>
                <button
                  type="button"
                  disabled={pending}
                  onClick={recording ? stopRecording : startRecording}
                  className={cn(
                    'relative grid h-24 w-24 place-items-center rounded-full text-white transition-all',
                    'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]',
                    'shadow-[0_20px_60px_-15px_rgba(99,102,241,0.7)]',
                    recording && 'scale-110',
                    pending && 'opacity-50',
                  )}
                  aria-label={recording ? 'Stop recording' : 'Start recording'}
                >
                  {recording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  {recording && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-fuchsia-500/40"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ repeat: Infinity, duration: 1.6 }}
                    />
                  )}
                </button>
              </AIGlow>
              <div className="mt-4 text-center text-xs text-foreground/55">
                {recording ? 'Listening… tap to stop' : pending ? 'Processing…' : 'Tap to speak'}
              </div>
            </div>

            {/* Conversation thread */}
            <div className="min-h-[38vh] space-y-3 p-5">
              {conversation.length === 0 && !pending && (
                <div className="flex h-full min-h-[34vh] flex-col items-center justify-center gap-3 px-4 text-center">
                  <Sparkles className="h-6 w-6 text-violet-500" />
                  <div className="max-w-md text-sm text-foreground/65">
                    Press the mic and try: <em>"I just had a bowl of dal and rice"</em> or <em>"How am I doing this week?"</em>
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {conversation.map((turn, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={cn('flex', turn.kind === 'you' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                        turn.kind === 'you'
                          ? 'bg-gradient-to-br from-blue-500/15 to-fuchsia-500/10 text-foreground'
                          : 'bg-foreground/[0.04] text-foreground',
                      )}
                    >
                      {turn.kind === 'sirah' && (
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">
                          <Sparkles className="h-2.5 w-2.5" /> SIRAH
                        </div>
                      )}
                      <p>{turn.text}</p>
                      {turn.audio && (
                        <button
                          type="button"
                          onClick={() => new Audio(turn.audio!).play()}
                          className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-foreground/55 hover:text-foreground"
                        >
                          <Volume2 className="h-3 w-3" /> Replay
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {pending && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="rounded-2xl bg-foreground/[0.04] px-4 py-3 text-sm text-foreground/65">
                    <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> SIRAH is thinking…
                  </div>
                </motion.div>
              )}
            </div>
          </Glass>

          {/* Side panel — how it works + examples */}
          <div className="space-y-5 lg:col-span-1">
            <Glass className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-4">
                <HelpCircle className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                <span className="text-sm font-medium">How it works</span>
              </div>
              <ul className="divide-y divide-foreground/[0.04]">
                {[
                  { icon: Mic, label: 'Tap the mic', sub: 'Allow microphone access, then speak naturally.' },
                  { icon: Sparkles, label: 'SIRAH understands', sub: 'It transcribes and figures out what you meant.' },
                  { icon: Volume2, label: 'Get a reply', sub: 'See the answer and replay any audio responses.' },
                ].map((s) => (
                  <li key={s.label} className="flex items-start gap-3 px-5 py-3">
                    <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-violet-700 dark:text-violet-300">
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-foreground/55">{s.sub}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Glass>

            <Glass className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-5 py-4">
                <Sparkles className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-300" />
                <span className="text-sm font-medium">Try saying</span>
              </div>
              <ul className="space-y-2 p-4">
                {[
                  { icon: Utensils, text: 'I just had a bowl of dal and rice' },
                  { icon: NotebookPen, text: 'Note that I slept poorly last night' },
                  { icon: HelpCircle, text: 'How am I doing this week?' },
                ].map((ex) => (
                  <li
                    key={ex.text}
                    className="flex items-center gap-3 rounded-xl bg-foreground/[0.03] px-3.5 py-2.5"
                  >
                    <ex.icon className="h-3.5 w-3.5 flex-shrink-0 text-foreground/45" />
                    <span className="text-sm italic text-foreground/80">"{ex.text}"</span>
                  </li>
                ))}
              </ul>
            </Glass>
          </div>
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}