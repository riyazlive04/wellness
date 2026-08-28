import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, X, Maximize2, AlertTriangle, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

import { BrandMark } from '@/design-system';
import { cn } from '@/lib/utils';
import { knowledgeApi, type KbAnswer } from '@/modules/workspace/api/knowledge';

/**
 * FloatingAssistant — an always-available chat bubble backed by the knowledge
 * base.
 *
 * This used to run on the role-scoped AI assistant, which reasoned over live
 * workspace data and could execute actions. It now answers from indexed
 * documents instead, which is a deliberate trade: replies are grounded and
 * cited, and the widget no longer knows about today's appointments or offers
 * one-tap actions.
 *
 * Because answers are only as good as the corpus, two states matter more than
 * they did before:
 *   - nothing indexed yet  → say so and point at the Knowledge page, rather
 *                            than inviting a question that can only fail
 *   - nothing relevant     → an amber panel, visually distinct from an answer,
 *                            so "I don't know" cannot be skim-read as a reply
 *
 * Mounted inside each authenticated shell. On the client portal it stacks
 * ABOVE the floating Voice FAB (`stack`). It hides itself on the Knowledge page
 * and on chat surfaces where it would cover the composer.
 */

const KNOWLEDGE_PATH = '/knowledge';
const HIDE_PREFIXES = ['/knowledge', '/ai', '/portal/assistant', '/admin/assistant', '/messaging', '/portal/chat'];
function isHidden(pathname: string): boolean {
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

interface Turn {
  id: string;
  question: string;
  answer: KbAnswer | null;
}

const STARTERS = [
  'How do I assign a program to many clients?',
  'Can I rely on photo-scanned calories?',
  'What reports can I generate?',
];

export function FloatingAssistant({ stack = false }: { stack?: boolean }) {
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

  // Only fetched once the panel is open: an idle bubble on every page should
  // not cost a request on every navigation.
  const docsQ = useQuery({
    queryKey: ['knowledge', 'documents'],
    queryFn: knowledgeApi.list,
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, thinking]);

  if (isHidden(pathname)) return null;

  const ready = (docsQ.data ?? []).filter((d) => d.status === 'ready');
  const hasCorpus = ready.length > 0;
  const passages = ready.reduce((n, d) => n + d.chunk_count, 0);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    setInput('');
    const id = `t_${Date.now()}`;
    setTurns((t) => [...t, { id, question: q, answer: null }]);
    setThinking(true);
    try {
      const answer = await knowledgeApi.ask(q);
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not answer that.');
      setTurns((t) => t.filter((turn) => turn.id !== id));
    } finally {
      setThinking(false);
    }
  }

  // Launcher offset: clear the mobile bottom nav everywhere; on the client
  // portal stack ABOVE the voice FAB (which already sits at the base spot).
  const launcherPos = stack
    ? 'bottom-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom)+5.5rem)] md:bottom-[5.5rem] right-4 md:right-6'
    : 'bottom-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom)+1rem)] md:bottom-6 right-4 md:right-6';

  return (
    <>
      {/* Launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            key="chat-fab"
            onClick={() => setOpen(true)}
            aria-label="Ask your documents"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className={cn(
              'no-select touch-target fixed z-40 grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-white shadow-xl ring-1 ring-foreground/10',
              'shadow-teal-500/20',
              launcherPos,
            )}
          >
            <BrandMark size={34} animated={false} />
            <span className="absolute inset-0 -z-10 rounded-full bg-teal-500/25 blur-md" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="chat-scrim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden"
            />
            <motion.section
              key="chat-panel"
              role="dialog"
              aria-label="Ask your documents"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className={cn(
                'fixed z-50 flex flex-col overflow-hidden border border-foreground/[0.08] bg-canvas/95 shadow-2xl backdrop-blur-xl',
                'inset-x-0 bottom-0 max-h-[82vh] rounded-t-3xl',
                'md:inset-x-auto md:bottom-6 md:right-6 md:h-[34rem] md:max-h-[80vh] md:w-[24rem] md:rounded-3xl',
              )}
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {/* Header */}
              <header className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-foreground/10">
                    <BrandMark size={22} animated={false} />
                  </span>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">Ask your documents</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">
                      {hasCorpus ? `${passages} passages indexed` : 'Knowledge base'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to={KNOWLEDGE_PATH}
                    onClick={() => setOpen(false)}
                    aria-label="Open the knowledge base"
                    className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.05]"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Link>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                    className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.05]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {/* Thread */}
              <div ref={scrollRef} className="momentum-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {turns.length === 0 && !thinking && (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-foreground/10">
                      <BrandMark size={34} animated={false} />
                    </span>

                    {docsQ.isLoading ? (
                      <p className="text-sm text-foreground/60">Checking your documents…</p>
                    ) : hasCorpus ? (
                      <>
                        <p className="px-4 text-sm text-foreground/75">
                          Ask anything covered by your documents. Every answer cites its source.
                        </p>
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {STARTERS.map((s) => (
                            <button key={s} type="button" onClick={() => ask(s)}
                              className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 text-[11px] text-foreground/75 hover:border-teal-400/30 hover:bg-foreground/[0.06]">
                              {s}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      // Nothing indexed: inviting a question here would only
                      // produce "not in my sources" every time.
                      <>
                        <p className="px-4 text-sm text-foreground/75">
                          Nothing is indexed yet, so there is nothing to answer from.
                        </p>
                        <Link
                          to={KNOWLEDGE_PATH}
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/[0.08] px-3 py-1.5 text-[11px] font-medium text-teal-700 hover:bg-teal-400/[0.15] dark:text-teal-200"
                        >
                          <BookOpen className="h-3 w-3" /> Add a document
                        </Link>
                      </>
                    )}
                  </div>
                )}

                {turns.map((t) => <Turn key={t.id} turn={t} />)}

                {thinking && (
                  <div className="flex items-center gap-2 text-xs text-foreground/55">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-500" /> Searching your documents…
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-foreground/[0.06] px-3 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                    rows={1}
                    disabled={!hasCorpus && !docsQ.isLoading}
                    placeholder={hasCorpus ? 'Ask a question…' : 'Index a document first'}
                    className="max-h-28 flex-1 resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none disabled:opacity-50"
                  />
                  <button type="button" onClick={() => ask(input)} disabled={!input.trim() || thinking || !hasCorpus}
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-600 to-teal-500 text-white transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100">
                    {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function Turn({ turn }: { turn: Turn }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-line rounded-2xl bg-gradient-to-br from-teal-600 to-teal-500 px-3.5 py-2.5 text-sm leading-relaxed text-white">
          {turn.question}
        </div>
      </div>

      {turn.answer && (
        turn.answer.outcome === 'no_match' ? (
          // Visually distinct from an answer, so a refusal cannot be skim-read
          // as a reply.
          <div className="flex max-w-[88%] items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] px-3.5 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-foreground/75">{turn.answer.answer}</span>
          </div>
        ) : (
          <div className="max-w-[88%] space-y-1.5">
            <div className="whitespace-pre-line rounded-2xl border border-foreground/[0.06] bg-foreground/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-foreground/90">
              {turn.answer.answer}
            </div>
            {turn.answer.citations.length > 0 && (
              <ul className="space-y-0.5 pl-1">
                {turn.answer.citations.slice(0, 4).map((c, i) => (
                  <li key={`${c.document_id}-${c.chunk_index}`} className="flex items-start gap-1.5 text-[10px] text-foreground/55">
                    <span className="font-mono text-foreground/35">[{i + 1}]</span>
                    <span className="flex-1 truncate">{c.heading ?? c.title}</span>
                    {/* Shown so a weak match is visible rather than implied. */}
                    <span className="tabular-nums text-foreground/35">{Math.round(c.similarity * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      )}
    </motion.div>
  );
}
