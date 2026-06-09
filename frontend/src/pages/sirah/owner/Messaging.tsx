import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronLeft, Loader2, MessageCircle, Search, Send } from 'lucide-react';
import { toast } from 'sonner';

import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { clientsApi, type ConversationSummary, type ThreadMessage } from '@/modules/workspace/api/clients';
import { cn } from '@/lib/utils';

/**
 * Owner-side messaging. Now wired to real backend (was mocked before):
 *  - GET  /workspaces/me/clients/conversations  → list of clients-with-messages
 *  - GET  /workspaces/me/clients/:id/messages   → full thread (oldest → newest)
 *  - POST /workspaces/me/clients/:id/messages   → reply
 *  - POST /workspaces/me/clients/:id/messages/read → mark unread → read
 *
 * Layout: two-column (list / thread). Both panes poll every 15s for fresh
 * data so a client sending a message shows up without a refresh.
 */
export default function OwnerMessaging() {
  const workspace = readWorkspace();
  const { id: routeClientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const convsQ = useQuery({
    queryKey: ['workspaces', 'me', 'conversations'],
    queryFn: () => clientsApi.listConversations(),
    refetchInterval: 15_000,
    retry: 1,
  });
  const conversations = convsQ.data ?? [];

  const activeClientId = routeClientId ?? conversations[0]?.client_id ?? null;
  const active = useMemo(
    () => conversations.find((c) => c.client_id === activeClientId) ?? null,
    [conversations, activeClientId],
  );

  // Mark thread read when admin opens the conversation
  useEffect(() => {
    if (!activeClientId) return;
    clientsApi.markClientThreadRead(activeClientId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'conversations'] }))
      .catch(() => undefined);
  }, [activeClientId, queryClient]);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${conversations.filter((c) => c.unread > 0).length} unread`}
    >
      <div className="grid h-[calc(100vh-64px)] grid-cols-1 md:grid-cols-[320px_1fr]">
        {/* Left pane */}
        <div className={cn('h-full overflow-hidden', routeClientId ? 'hidden md:block' : 'block')}>
          <ConvList
            conversations={conversations}
            activeId={activeClientId}
            loading={convsQ.isLoading}
            onSelect={(id) => navigate(`/messaging/${id}`)}
          />
        </div>

        {/* Right pane */}
        <div className={cn('flex h-full flex-col bg-canvas', !routeClientId && 'hidden md:flex')}>
          {active ? (
            <Thread
              conversation={active}
              onBack={() => navigate('/messaging')}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
    </OwnerLayout>
  );
}

// ─── Conversation list ──────────────────────────────────────────────

function ConvList({
  conversations, activeId, loading, onSelect,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.client_name.toLowerCase().includes(q) ||
        (c.last_message ?? '').toLowerCase().includes(q),
    );
  }, [conversations, query]);

  return (
    <div className="flex h-full flex-col border-r border-foreground/[0.06] bg-canvas/60 backdrop-blur-md">
      <div className="border-b border-foreground/[0.06] p-4">
        <h2 className="text-base font-semibold tracking-tight">Messages</h2>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/45" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] py-2 pl-9 pr-3 text-xs focus:border-violet-400/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-6 text-xs text-foreground/55">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-foreground/55">
            {query ? 'No matches.' : 'No conversations yet. Clients will appear here as they message you.'}
          </div>
        ) : (
          <ul>
            {filtered.map((c) => {
              const isActive = c.client_id === activeId;
              const initials = initialsOf(c.client_name);
              return (
                <li key={c.client_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.client_id)}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-foreground/[0.04] px-4 py-3 text-left transition-colors',
                      isActive ? 'bg-violet-500/8' : 'hover:bg-foreground/[0.03]',
                    )}
                  >
                    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">{c.client_name}</div>
                        {c.last_message_at && (
                          <div className="flex-shrink-0 text-[10px] uppercase tracking-[0.14em] text-foreground/55">
                            {relativeTime(c.last_message_at)}
                          </div>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <div className="truncate text-[11px] text-foreground/65">
                          {c.last_sender === 'admin' && <span className="text-foreground/45">You: </span>}
                          {c.last_message ?? '—'}
                        </div>
                        {c.unread > 0 && (
                          <span className="flex-shrink-0 rounded-full bg-violet-500 px-1.5 py-0 text-[10px] font-medium text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Thread ─────────────────────────────────────────────────────────

function Thread({ conversation, onBack }: { conversation: ConversationSummary; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const threadQ = useQuery({
    queryKey: ['workspaces', 'me', 'thread', conversation.client_id],
    queryFn: () => clientsApi.clientThread(conversation.client_id, 200),
    refetchInterval: 10_000,
    retry: 1,
  });
  const messages = threadQ.data ?? [];

  // Scroll to bottom when messages arrive or when switching conversations
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [conversation.client_id, messages.length]);

  const sendMut = useMutation({
    mutationFn: (text: string) => clientsApi.sendToClient(conversation.client_id, text),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'thread', conversation.client_id] });
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'conversations'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Could not send.'),
  });

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    sendMut.mutate(text);
  }

  const initials = initialsOf(conversation.client_name);

  return (
    <>
      <header className="flex items-center justify-between border-b border-foreground/[0.06] bg-canvas/85 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="grid h-9 w-9 place-items-center rounded-lg text-foreground/65 hover:bg-foreground/[0.05] hover:text-foreground md:hidden"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-medium">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{conversation.client_name}</div>
            <div className="truncate text-[11px] text-foreground/65">
              {conversation.program || 'Client'}
              {conversation.last_message_at && <> · last active {relativeTime(conversation.last_message_at)}</>}
            </div>
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 0%, rgba(99,102,241,0.05), transparent 50%),' +
            'radial-gradient(circle at 80% 100%, rgba(125,190,157,0.04), transparent 55%)',
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {threadQ.isLoading ? (
            <div className="flex items-center justify-center p-6 text-xs text-foreground/55">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading thread…
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-6 text-center text-sm text-foreground/65">
              No messages yet. Say hello.
            </div>
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} />)
          )}
        </div>
      </div>

      <div className="border-t border-foreground/[0.06] bg-canvas/85 p-3 backdrop-blur-md md:p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder={`Message ${conversation.client_name.split(' ')[0]}…`}
            maxLength={4000}
            className="flex-1 resize-none rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-2.5 text-sm placeholder:text-foreground/45 focus:border-violet-400/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sendMut.isPending || !draft.trim()}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.5)] disabled:opacity-50"
            aria-label="Send"
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </>
  );
}

function Bubble({ message }: { message: ThreadMessage }) {
  const isAdmin = message.sender_type === 'admin';
  const isSystem = message.sender_type === 'system';
  if (isSystem) {
    return (
      <div className="self-center rounded-full bg-foreground/[0.05] px-3 py-1 text-[11px] text-foreground/65">
        {message.content}
      </div>
    );
  }
  return (
    <div className={cn('flex', isAdmin ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isAdmin
            ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white'
            : 'border border-foreground/[0.06] bg-foreground/[0.03] text-foreground/90',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <div
          className={cn(
            'mt-1 text-[10px] uppercase tracking-[0.16em]',
            isAdmin ? 'text-white/65' : 'text-foreground/45',
          )}
        >
          {new Date(message.created_at).toLocaleTimeString('en-IN', {
            hour: 'numeric', minute: '2-digit', hour12: true,
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col items-center justify-center px-6 text-center"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-700 dark:text-violet-200">
        <MessageCircle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-base font-medium">Select a conversation</h2>
      <p className="mt-1 max-w-sm text-sm text-foreground/65">
        Pick a client on the left. New messages from clients show up here in real time.
      </p>
    </motion.div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

function relativeTime(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60)      return `${sec}s ago`;
  if (sec < 3600)    return `${Math.round(sec / 60)}m ago`;
  if (sec < 86_400)  return `${Math.round(sec / 3600)}h ago`;
  if (sec < 604_800) return `${Math.round(sec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

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