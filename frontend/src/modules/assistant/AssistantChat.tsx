import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, Loader2, RotateCcw, History, Brain, X, Trash2, Plus,
  Sun, Zap, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { cn } from '@/lib/utils';
import {
  assistantApi, type AssistantMessage, type SuggestedAction, type Conversation,
} from './api';

/**
 * AssistantChat — the shared UI for all three role-scoped assistants (Module 6).
 * The backend resolves which assistant the caller gets, so this single
 * component serves executive / clinical / wellness with no role prop.
 */
export function AssistantChat() {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [showBrief, setShowBrief] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);

  const profileQ = useQuery({ queryKey: ['assistant', 'me'], queryFn: assistantApi.me, staleTime: 5 * 60_000 });
  const briefQ = useQuery({ queryKey: ['assistant', 'brief'], queryFn: assistantApi.brief, staleTime: 5 * 60_000 });
  const convsQ = useQuery({ queryKey: ['assistant', 'conversations'], queryFn: assistantApi.listConversations });

  const profile = profileQ.data;

  // Load messages when switching conversations.
  const convQ = useQuery({
    queryKey: ['assistant', 'conversation', activeId],
    queryFn: () => assistantApi.getConversation(activeId!),
    enabled: !!activeId,
  });
  useEffect(() => {
    if (convQ.data) setMessages(convQ.data.messages);
  }, [convQ.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking]);

  const isEmpty = messages.length === 0;

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
    setShowBrief(false);
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
      const synthetic: AssistantMessage = {
        id: `act_${Date.now()}`, conversation_id: activeId ?? '', role: 'assistant',
        content: res.summary, tokens: null, latency_ms: null, actions: [],
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, synthetic]);
      toast.success(res.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setThinking(false);
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setShowBrief(true);
  }

  async function openConversation(c: Conversation) {
    setActiveId(c.id);
    setShowHistory(false);
    setShowBrief(false);
  }

  async function deleteConversation(id: string) {
    try {
      await assistantApi.deleteConversation(id);
      if (id === activeId) newChat();
      queryClient.invalidateQueries({ queryKey: ['assistant', 'conversations'] });
    } catch {
      toast.error('Could not delete conversation.');
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-foreground/[0.06] bg-canvas/85 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-blue-600/35 to-fuchsia-500/25">
            <Sparkles className="h-4 w-4 text-foreground" />
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">{profile?.name ?? 'AI Assistant'}</div>
            <div className="text-[11px] text-foreground/60">{profile?.role ?? 'Your personal assistant'}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <HeaderButton icon={Sun} label="Brief" active={showBrief} onClick={() => setShowBrief((v) => !v)} />
          <HeaderButton icon={Brain} label="Memory" active={showMemory} onClick={() => setShowMemory(true)} />
          <div className="relative">
            <HeaderButton icon={History} label="History" active={showHistory} onClick={() => setShowHistory((v) => !v)} />
            <AnimatePresence>
              {showHistory && (
                <HistoryDropdown
                  conversations={convsQ.data ?? []}
                  activeId={activeId}
                  onOpen={openConversation}
                  onDelete={deleteConversation}
                  onClose={() => setShowHistory(false)}
                />
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            onClick={newChat}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white"
          >
            <RotateCcw className="h-3 w-3" /> New
          </button>
        </div>
      </div>

      {/* AI-not-configured notice */}
      {profile && !profile.aiConfigured && (
        <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-400/[0.07] px-5 py-2 text-xs text-amber-700 dark:text-amber-200">
          <AlertCircle className="h-3.5 w-3.5" />
          Running in offline mode — set GEMINI_API_KEY on the server for full AI replies.
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          {/* Morning brief */}
          {showBrief && briefQ.data && (
            <Glass className="overflow-hidden border-violet-400/20">
              <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-4 py-2.5">
                <Sun className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">{briefQ.data.headline}</span>
                {briefQ.data.source === 'fallback' && (
                  <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground/50">offline</span>
                )}
                <button type="button" onClick={() => setShowBrief(false)} className="ml-auto rounded p-1 text-foreground/40 hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="whitespace-pre-line px-4 py-3 text-sm leading-relaxed text-foreground/85">
                {briefQ.data.body}
              </div>
            </Glass>
          )}

          {/* Greeting / capability chips */}
          {isEmpty && !thinking && profile && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20">
                <Sparkles className="h-6 w-6 text-foreground" />
              </div>
              <p className="mx-auto max-w-lg text-pretty text-sm text-foreground/75">{profile.greeting}</p>
              <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                {profile.capabilities.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => send(c)}
                    className="rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/75 transition-colors hover:border-violet-400/30 hover:bg-foreground/[0.06]"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} onAction={runAction} />
          ))}

          {thinking && (
            <div className="flex items-center gap-2 text-xs text-foreground/55">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
              {profile?.name ?? 'The assistant'} is thinking…
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-foreground/[0.06] bg-canvas/85 px-5 py-3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            rows={1}
            placeholder={isEmpty ? `Ask ${profile?.name ?? 'your assistant'} anything…` : 'Follow up…'}
            className="max-h-32 flex-1 resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-violet-400/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={!input.trim() || thinking}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
          >
            {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showMemory && <MemoryDrawer onClose={() => setShowMemory(false)} />}
      </AnimatePresence>
    </div>
  );
}

function HeaderButton({ icon: Icon, label, active, onClick }: {
  icon: React.ComponentType<{ className?: string }>; label: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
        active ? 'border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-200'
               : 'border-foreground/10 bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.06]',
      )}
    >
      <Icon className="h-3 w-3" /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function MessageBubble({ message, onAction }: { message: AssistantMessage; onAction: (a: SuggestedAction) => void }) {
  const isUser = message.role === 'user';
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] space-y-2', isUser && 'items-end')}>
        <div className={cn(
          'whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white'
                 : 'border border-foreground/[0.06] bg-foreground/[0.03] text-foreground/90',
        )}>
          {message.content}
        </div>
        {!isUser && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.actions.map((a) => (
              <button
                key={a.type}
                type="button"
                onClick={() => onAction(a)}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-400/[0.08] px-3 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-400/[0.15] dark:text-violet-200"
              >
                <Zap className="h-3 w-3" /> {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function HistoryDropdown({ conversations, activeId, onOpen, onDelete, onClose }: {
  conversations: Conversation[]; activeId: string | null;
  onOpen: (c: Conversation) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
        className="absolute right-0 top-full z-20 mt-2 w-72"
      >
        <Glass variant="heavy" className="max-h-80 overflow-y-auto p-1.5 shadow-xl">
          {conversations.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-foreground/50">No conversations yet</div>
          ) : conversations.map((c) => (
            <div
              key={c.id}
              className={cn('group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-foreground/[0.05]', c.id === activeId && 'bg-foreground/[0.05]')}
            >
              <button type="button" onClick={() => onOpen(c)} className="min-w-0 flex-1 truncate text-left text-foreground/80">{c.title}</button>
              <button type="button" onClick={() => onDelete(c.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5 text-foreground/40 hover:text-rose-500" />
              </button>
            </div>
          ))}
        </Glass>
      </motion.div>
    </>
  );
}

function MemoryDrawer({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const memQ = useQuery({ queryKey: ['assistant', 'memory'], queryFn: assistantApi.listMemory });
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  async function add() {
    if (!key.trim() || !value.trim()) return;
    try {
      await assistantApi.remember(key.trim(), value.trim());
      setKey(''); setValue('');
      queryClient.invalidateQueries({ queryKey: ['assistant', 'memory'] });
    } catch { toast.error('Could not save.'); }
  }
  async function remove(id: string) {
    try {
      await assistantApi.forget(id);
      queryClient.invalidateQueries({ queryKey: ['assistant', 'memory'] });
    } catch { toast.error('Could not delete.'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <motion.div
        initial={{ x: 360 }} animate={{ x: 0 }} exit={{ x: 360 }} transition={{ type: 'tween', duration: 0.25 }}
        className="relative z-10 h-full w-full max-w-sm"
      >
        <Glass variant="heavy" className="flex h-full flex-col p-0 shadow-2xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.08] px-5 py-4">
            <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-violet-500" /><span className="text-sm font-semibold">What I remember</span></div>
            <button type="button" onClick={onClose} className="rounded p-1 text-foreground/50 hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
            {memQ.data?.length ? memQ.data.map((m) => (
              <div key={m.id} className="group flex items-start gap-2 rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground/80">{m.key}</div>
                  <div className="text-xs text-foreground/60">{m.value}</div>
                </div>
                <button type="button" onClick={() => remove(m.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5 text-foreground/40 hover:text-rose-500" />
                </button>
              </div>
            )) : <div className="py-8 text-center text-xs text-foreground/45">Nothing remembered yet.</div>}
          </div>
          <div className="space-y-2 border-t border-foreground/[0.08] px-5 py-4">
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key (e.g. preferred_tone)" className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-xs focus:border-violet-400/50 focus:outline-none" />
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-xs focus:border-violet-400/50 focus:outline-none" />
            <button type="button" onClick={add} disabled={!key.trim() || !value.trim()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
              <Plus className="h-3.5 w-3.5" /> Remember this
            </button>
          </div>
        </Glass>
      </motion.div>
    </div>
  );
}
