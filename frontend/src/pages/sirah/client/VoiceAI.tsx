import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Sparkles, Loader2, Volume2 } from 'lucide-react';
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
        { kind: 'you',   text: data.transcript },
        { kind: 'sirah', text: data.ai_reply, audio: data.audio_url },
      ]);
      if (data.logged_meal) {
        toast.success(`Logged ${data.logged_meal.meal_name} (${data.logged_meal.kcal} kcal)`);
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
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10"
      >
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">AI · Voice</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Just say it.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65 md:text-base">
            Log meals, jot a journal entry, ask a question — SIRAH listens and answers back.
          </p>
        </motion.div>

        {/* Conversation thread */}
        <motion.div variants={fadeUp} className="mt-6 min-h-[40vh] space-y-3">
          {conversation.length === 0 && !pending && (
            <Glass className="flex flex-col items-center gap-3 p-8 text-center">
              <Sparkles className="h-6 w-6 text-violet-500" />
              <div className="text-sm text-foreground/65">
                Press the mic and try: <em>"I just had a bowl of dal and rice"</em> or <em>"How am I doing this week?"</em>
              </div>
            </Glass>
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
        </motion.div>

        {/* Mic — floating, big, satisfying */}
        <motion.div variants={fadeUp} className="mt-6 flex justify-center">
          <AIGlow intensity={recording ? 'strong' : 'medium'} animated>
            <button
              type="button"
              disabled={pending}
              onClick={recording ? stopRecording : startRecording}
              className={cn(
                'relative grid h-24 w-24 place-items-center rounded-full text-white transition-all',
                'bg-gradient-to-br from-blue-600 to-fuchsia-500',
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
        </motion.div>
        <div className="mt-3 text-center text-xs text-foreground/55">
          {recording ? 'Listening… tap to stop' : pending ? 'Processing…' : 'Tap to speak'}
        </div>
      </motion.div>
    </ClientLayout>
  );
}