import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, X, Zap, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';

import { BrandMark } from '@/design-system';
import { cn } from '@/lib/utils';
import { assistantApi, type AssistantMessage, type SuggestedAction, type AssistantType } from './api';

/**
 * FloatingAssistant — an always-available chat bubble for the role-scoped AI
 * assistant (Module 6). The backend resolves which assistant the caller gets
 * (executive / clinical / wellness) from their identity, so this single widget
 * serves every role with no role prop.
 *
 * Mounted inside each authenticated shell (owner / client / admin). On the
 * client portal it stacks ABOVE the floating Voice FAB (`stack`). It hides
 * itself on the dedicated full-assistant pages to avoid a redundant launcher.
 */
const FULL_PAGE_BY_TYPE: Record<AssistantType, string> = {
  executive: '/admin/assistant',
  clinical: '/ai',
  wellness: '/portal/assistant',
};
// Hide the floating launcher on dedicated assistant pages AND on chat/messaging
// surfaces (where it would overlap the message composer / send button).
const HIDE_PREFIXES = ['/ai', '/portal/assistant', '/admin/assistant', '/messaging', '/portal/chat'];
function isHidden(pathname: string): boolean {
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function FloatingAssistant({ stack = false }: { stack?: boolean }) {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

  const profileQ = useQuery({ queryKey: ['assistant', 'me'], queryFn: assistantApi.me, staleTime: 5 * 60_000, retry: false });
  const profile = profileQ.data;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking]);

  if (isHidden(pathname)) return null;

  const isEmpty = messages.length === 0;
  const fullPagePath = profile ? FULL_PAGE_BY_TYPE[profile.type] : null;

  async function ensureConversation(): Promise<string> {
    if (activeId) return activeId;
    const conv = await assistantApi.createConversation();
    setActiveId(conv.id);
    queryClient.invalidateQueries({ queryKey: ['assistant', 'conversations'] });
    return conv.id;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    setInput('');
    const optimistic: AssistantMessage = {
      id: `tmp_${Date.now()}`, conversation_id: '', role: 'user', content: trimmed,
      tokens: null, latency_ms: null, actions: [], created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setThinking(true);
    try {
      const id = await ensureConversation();
      const reply = await assistantApi.sendMessage(id, trimmed);
      setMessages((m) => [...m, reply]);
      queryClient.invalidateQueries({ queryKey: ['assistant', 'conversations'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The assistant could not respond.');
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setThinking(false);
    }
  }

  async function runAction(action: SuggestedAction) {
    setThinking(true);
    try {
      const res = await assistantApi.runAction(action.type, action.params);
      setMessages((m) => [...m, {
        id: `act_${Date.now()}`, conversation_id: activeId ?? '', role: 'assistant',
        content: res.summary, tokens: null, latency_ms: null, actions: [], created_at: new Date().toISOString(),
      }]);
      toast.success(res.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed.');
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
            aria-label="Open AI assistant chat"
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
              aria-label="AI assistant"
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
                    <div className="text-sm font-semibold">{profile?.name ?? 'AI Assistant'}</div>
                    <div className="text-[10px] uppercase tracking-[0.16em] text-foreground/50">{profile?.role ?? 'Your assistant'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {fullPagePath && (
                    <Link to={fullPagePath} onClick={() => setOpen(false)} aria-label="Open full assistant"
                      className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.05]">
                      <Maximize2 className="h-4 w-4" />
                    </Link>
                  )}
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                    className="grid h-8 w-8 place-items-center rounded-lg text-foreground/60 hover:bg-foreground/[0.05]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {/* AI not configured */}
              {profile && !profile.aiConfigured && (
                <div className="border-b border-amber-400/20 bg-amber-400/[0.07] px-4 py-2 text-[11px] text-amber-700 dark:text-amber-200">
                  Offline mode — set GEMINI_API_KEY for full AI replies.
                </div>
              )}

              {/* Thread */}
              <div ref={scrollRef} className="momentum-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {isEmpty && !thinking && (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-foreground/10">
                      <BrandMark size={34} animated={false} />
                    </span>
                    <p className="px-4 text-sm text-foreground/75">{profile?.greeting ?? 'How can I help?'}</p>
                    {profile && profile.capabilities.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {profile.capabilities.slice(0, 4).map((c) => (
                          <button key={c} type="button" onClick={() => send(c)}
                            className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 text-[11px] text-foreground/75 hover:border-teal-400/30 hover:bg-foreground/[0.06]">
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {messages.map((m) => <Bubble key={m.id} message={m} onAction={runAction} />)}

                {thinking && (
                  <div className="flex items-center gap-2 text-xs text-foreground/55">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-500" /> {profile?.name ?? 'Assistant'} is thinking…
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-foreground/[0.06] px-3 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                    rows={1}
                    placeholder={`Ask ${profile?.name ?? 'your assistant'}…`}
                    className="max-h-28 flex-1 resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none"
                  />
                  <button type="button" onClick={() => send(input)} disabled={!input.trim() || thinking}
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

function Bubble({ message, onAction }: { message: AssistantMessage; onAction: (a: SuggestedAction) => void }) {
  const isUser = message.role === 'user';
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[88%] space-y-2">
        <div className={cn(
          'whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-gradient-to-br from-teal-600 to-teal-500 text-white'
                 : 'border border-foreground/[0.06] bg-foreground/[0.04] text-foreground/90',
        )}>
          {message.content}
        </div>
        {!isUser && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.actions.map((a) => (
              <button key={a.type} type="button" onClick={() => onAction(a)}
                className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-400/[0.15] dark:text-teal-200">
                <Zap className="h-3 w-3" /> {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
