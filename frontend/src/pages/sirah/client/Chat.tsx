import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Send, MessageCircle, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type ClientMessage } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

export default function ClientChat() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const messagesQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(100),
    refetchInterval: 15_000,
    retry: 1,
  });
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: ClientMessage[] = messagesQ.data ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: (content: string) => clientsApi.sendMessage(content),
    onSuccess: () => {
      setDraft('');
      // Optimistically refresh the thread so the new message shows immediately
      // — backend cache is the source of truth so we re-fetch rather than
      // hand-rolling an optimistic cache write.
      queryClient.invalidateQueries({ queryKey: ['me', 'messages'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not send. Try again.'),
  });

  function send() {
    const body = draft.trim();
    if (!body || sendMut.isPending) return;
    sendMut.mutate(body);
  }

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div
        variants={stagger(0.06, 0.05)}
        initial="initial"
        animate="animate"
        className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-3xl flex-col px-4 py-6 md:h-[calc(100vh-3rem)] md:px-8 md:py-10"
      >
        <motion.div variants={fadeUp} className="mb-4">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Talk · Chat</span>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Your nutritionist</h1>
        </motion.div>

        <motion.div variants={fadeUp} className="flex flex-1 flex-col overflow-hidden">
          <Glass className="flex flex-1 flex-col overflow-hidden">
            <div ref={scrollRef} className="scrollbar-hide flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <MessageCircle className="h-6 w-6 text-foreground/35" />
                  <div className="text-sm text-foreground/55">No messages yet. Say hi.</div>
                </div>
              )}
              {messages.slice().reverse().map((m) => {
                const mine = m.sender_type === 'client';
                return (
                  <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                        mine
                          ? 'bg-gradient-to-br from-blue-500/15 to-fuchsia-500/10'
                          : m.sender_type === 'system'
                            ? 'bg-violet-500/10'
                            : 'bg-foreground/[0.04]',
                      )}
                    >
                      {m.sender_type === 'system' && (
                        <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-violet-600">
                          <Sparkles className="h-2.5 w-2.5" /> SIRAH
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-foreground/45">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-foreground/[0.06] p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder="Message your nutritionist…"
                  className="flex-1 resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-violet-400/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={!draft.trim() || sendMut.isPending}
                  className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)] disabled:opacity-40"
                  aria-label="Send"
                >
                  {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </Glass>
        </motion.div>
      </motion.div>
    </ClientLayout>
  );
}