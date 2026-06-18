import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Loader2, MessageCircle, Search, Send, Sparkles, Wand2, X, ExternalLink, Hand,
  Paperclip, Mic, Square, SmilePlus, Reply, Pin, Pencil, Trash2, Check, CheckCheck, CornerUpLeft,
  Clock, Bookmark, Plus,
} from 'lucide-react';
import { toast } from 'sonner';

import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { clientsApi, type ConversationSummary, type ThreadMessage, type MsgAttachment, type QuickReply } from '@/modules/workspace/api/clients';
import { collaborationApi } from '@/modules/workspace/api/collaboration';
import { useMicRecorder } from '@/modules/workspace/voice-ai/useMicRecorder';
import { cn } from '@/lib/utils';

const REACTIONS = ['👍', '❤️', '😂', '🔥', '🙏', '😮'];

/** Owner-side messaging — WhatsApp-style: media, reactions, reply, edit/delete, pin, read receipts. */
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

  useEffect(() => {
    if (!activeClientId) return;
    clientsApi.markClientThreadRead(activeClientId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'conversations'] }))
      .catch(() => undefined);
  }, [activeClientId, queryClient]);

  const totalUnread = conversations.reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0);

  return (
    <OwnerLayout
      practiceName={workspace.practiceName} ownerName={workspace.ownerName} initials={workspace.initials}
      trialDaysLeft={28} topbarContext={`${totalUnread} unread`}
    >
      <div className="grid h-[calc(100vh-64px)] grid-cols-1 md:grid-cols-[340px_1fr]">
        <div className={cn('h-full overflow-hidden', routeClientId ? 'hidden md:block' : 'block')}>
          <ConvList conversations={conversations} activeId={activeClientId} loading={convsQ.isLoading}
            onSelect={(id) => navigate(`/messaging/${id}`)} />
        </div>
        <div className={cn('flex h-full flex-col bg-canvas', !routeClientId && 'hidden md:flex')}>
          {active ? <Thread conversation={active} onBack={() => navigate('/messaging')} /> : <EmptyState />}
        </div>
      </div>
    </OwnerLayout>
  );
}

// ─── Conversation list ──────────────────────────────────────────────

function ConvList({ conversations, activeId, loading, onSelect }: {
  conversations: ConversationSummary[]; activeId: string | null; loading: boolean; onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (tab === 'unread' && c.unread === 0) return false;
      if (!q) return true;
      return c.client_name.toLowerCase().includes(q) || (c.last_message ?? '').toLowerCase().includes(q);
    });
  }, [conversations, query, tab]);

  const unreadCount = conversations.filter((c) => c.unread > 0).length;

  return (
    <div className="flex h-full flex-col border-r border-foreground/[0.06] bg-canvas/60 backdrop-blur-md">
      <div className="border-b border-foreground/[0.06] px-4 pb-3 pt-4">
        <h2 className="text-lg font-semibold tracking-tight">Messages</h2>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/45" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations…"
            className="w-full rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] py-2 pl-9 pr-3 text-xs focus:border-violet-400/60 focus:outline-none" />
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <FilterTab label="All" count={conversations.length} active={tab === 'all'} onClick={() => setTab('all')} />
          <FilterTab label="Unread" count={unreadCount} active={tab === 'unread'} onClick={() => setTab('unread')} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-6 text-xs text-foreground/55"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-foreground/55">
            {query ? 'No matches.' : tab === 'unread' ? 'All caught up — no unread messages.' : 'No conversations yet. Clients appear here as they message you.'}
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((c) => {
              const isActive = c.client_id === activeId;
              const presence = presenceOf(c.last_active_at);
              return (
                <li key={c.client_id} className="px-2">
                  <button type="button" onClick={() => onSelect(c.client_id)}
                    className={cn('relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                      isActive ? 'bg-violet-500/[0.10]' : 'hover:bg-foreground/[0.04]')}>
                    {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-blue-600 to-fuchsia-500" />}
                    <Avatar name={c.client_name} url={c.avatar_url} online={presence.online} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className={cn('truncate text-sm', c.unread > 0 ? 'font-semibold' : 'font-medium')}>{c.client_name}</div>
                        {c.last_message_at && (
                          <div className={cn('flex-shrink-0 text-[10px]', c.unread > 0 ? 'font-medium text-violet-600 dark:text-violet-300' : 'text-foreground/45')}>
                            {relativeTime(c.last_message_at)}
                          </div>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <div className={cn('truncate text-[12px]', c.unread > 0 ? 'text-foreground/85' : 'text-foreground/55')}>
                          {c.last_sender === 'admin' && <span className="text-foreground/40">You: </span>}
                          {c.last_message ?? '—'}
                        </div>
                        {c.unread > 0 && (
                          <span className="grid h-[18px] min-w-[18px] flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-1 text-[10px] font-semibold text-white">{c.unread}</span>
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

function FilterTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
        active ? 'bg-foreground/10 text-foreground' : 'text-foreground/55 hover:bg-foreground/[0.05]')}>
      {label}<span className="text-[10px] text-foreground/45">{count}</span>
    </button>
  );
}

// ─── Thread ─────────────────────────────────────────────────────────

function Thread({ conversation, onBack }: { conversation: ConversationSummary; onBack: () => void }) {
  const queryClient = useQueryClient();
  const cid = conversation.client_id;
  const [draft, setDraft] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [replies, setReplies] = useState<string[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSummary(null); setReplies([]); setReplyTo(null); setEditing(null); }, [cid]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'thread', cid] });
    queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'conversations'] });
    queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'scheduled', cid] });
  };

  async function runSummary() {
    setLoadingSummary(true);
    try { const r = await collaborationApi.summary(cid); setSummary(r.summary); }
    catch { toast.error('Could not summarize.'); } finally { setLoadingSummary(false); }
  }
  async function runReplies() {
    setLoadingReplies(true);
    try { const r = await collaborationApi.smartReplies(cid); setReplies(r.replies); }
    catch { toast.error('Could not suggest replies.'); } finally { setLoadingReplies(false); }
  }

  const threadQ = useQuery({
    queryKey: ['workspaces', 'me', 'thread', cid],
    queryFn: () => clientsApi.clientThread(cid, 200),
    refetchInterval: 10_000, retry: 1,
  });
  const messages = threadQ.data ?? [];
  const items = useMemo(() => groupMessages(messages), [messages]);
  const pinned = useMemo(() => messages.filter((m) => m.metadata?.pinned_at && !m.metadata?.deleted_at), [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [cid, messages.length]);

  const sendMut = useMutation({
    mutationFn: (opts: { content?: string; attachment?: MsgAttachment; replyTo?: string }) => clientsApi.sendToClient(cid, opts),
    onSuccess: () => { setDraft(''); setReplyTo(null); invalidate(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not send.'),
  });
  const reactMut = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) => clientsApi.reactToClientMsg(cid, id, emoji),
    onSuccess: invalidate,
  });
  const editMut = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => clientsApi.editClientMsg(cid, id, content),
    onSuccess: () => { setEditing(null); invalidate(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not edit.'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteClientMsg(cid, id),
    onSuccess: invalidate, onError: () => toast.error('Could not delete.'),
  });
  const pinMut = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => clientsApi.pinClientMsg(cid, id, pinned),
    onSuccess: invalidate,
  });

  // Quick replies + scheduled messages
  const quickQ = useQuery({ queryKey: ['workspaces', 'me', 'quick-replies'], queryFn: clientsApi.listQuickReplies, staleTime: 5 * 60_000 });
  const scheduledQ = useQuery({ queryKey: ['workspaces', 'me', 'scheduled', cid], queryFn: () => clientsApi.listScheduled(cid), refetchInterval: 30_000, retry: 1 });
  const saveQRMut = useMutation({
    mutationFn: (body: string) => clientsApi.createQuickReply(body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'quick-replies'] }); toast.success('Saved as a quick reply.'); },
  });
  const delQRMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteQuickReply(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'quick-replies'] }),
  });
  const cancelSchedMut = useMutation({
    mutationFn: (id: string) => clientsApi.cancelScheduled(cid, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspaces', 'me', 'scheduled', cid] }),
  });
  const scheduled = scheduledQ.data ?? [];

  function send() {
    if (editing) { if (editing.text.trim()) editMut.mutate({ id: editing.id, content: editing.text }); return; }
    const text = draft.trim();
    if (!text) return;
    sendMut.mutate({ content: text, replyTo: replyTo?.id });
  }
  function scheduleSend(whenISO: string) {
    const text = draft.trim();
    if (!text) { toast.error('Type a message to schedule.'); return; }
    sendMut.mutate({ content: text, replyTo: replyTo?.id, scheduledFor: whenISO });
    toast.success('Message scheduled.');
  }

  async function onPickImage(file: File) {
    setAttaching(true);
    try {
      const url = await downscaleToDataUrl(file, 1280, 0.82);
      sendMut.mutate({ attachment: { url, type: 'image/jpeg', name: file.name, size: url.length }, replyTo: replyTo?.id });
    } catch { toast.error('Could not attach that image.'); }
    finally { setAttaching(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  // Voice recording
  const recorder = useMicRecorder({
    onAutoStop: async (blob) => { await sendVoice(blob); },
  });
  async function sendVoice(blob: Blob | null) {
    if (!blob || blob.size === 0) return;
    try {
      const url = await blobToDataUrl(blob);
      sendMut.mutate({ attachment: { url, type: blob.type || 'audio/webm', name: 'voice-note', size: blob.size }, replyTo: replyTo?.id });
    } catch { toast.error('Could not send voice note.'); }
  }
  async function toggleMic() {
    if (recorder.status === 'recording') { const blob = await recorder.stop(); await sendVoice(blob); }
    else { await recorder.start(); }
  }

  const presence = presenceOf(conversation.last_active_at);
  const recording = recorder.status === 'recording';

  return (
    <>
      <header className="flex items-center justify-between border-b border-foreground/[0.06] bg-canvas/85 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="grid h-9 w-9 place-items-center rounded-lg text-foreground/65 hover:bg-foreground/[0.05] md:hidden" aria-label="Back"><ChevronLeft className="h-4 w-4" /></button>
          <Avatar name={conversation.client_name} url={conversation.avatar_url} online={presence.online} size={40} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{conversation.client_name}</div>
            <div className={cn('truncate text-[11px]', presence.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground/60')}>
              {presence.online ? 'Active now' : presence.label}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Link to={`/clients/${cid}`} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs text-foreground/70 hover:bg-foreground/[0.06]"><ExternalLink className="h-3 w-3" /> <span className="hidden sm:inline">Profile</span></Link>
          <button type="button" onClick={runSummary} disabled={loadingSummary}
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-400/[0.08] px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-400/[0.15] disabled:opacity-50 dark:text-violet-200">
            {loadingSummary ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Summarize
          </button>
        </div>
      </header>

      {/* Pinned bar */}
      {pinned.length > 0 && (
        <div className="border-b border-amber-400/20 bg-amber-400/[0.05] px-4 py-1.5">
          {pinned.slice(0, 2).map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-[11px] text-foreground/70">
              <Pin className="h-3 w-3 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">{previewOf(m)}</span>
              <button type="button" onClick={() => pinMut.mutate({ id: m.id, pinned: false })} className="ml-auto flex-shrink-0 text-foreground/40 hover:text-foreground"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Scheduled bar */}
      {scheduled.length > 0 && (
        <div className="border-b border-blue-400/20 bg-blue-400/[0.05] px-4 py-1.5">
          {scheduled.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-[11px] text-foreground/70">
              <Clock className="h-3 w-3 flex-shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="truncate">{previewOf(m)}</span>
              <span className="flex-shrink-0 text-foreground/45">· {m.metadata?.scheduled_for ? new Date(m.metadata.scheduled_for).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : 'scheduled'}</span>
              <button type="button" onClick={() => cancelSchedMut.mutate(m.id)} className="ml-auto flex-shrink-0 text-foreground/40 hover:text-rose-500">Cancel</button>
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6"
        style={{ backgroundImage: 'radial-gradient(circle at 30% 0%, rgba(99,102,241,0.05), transparent 50%),radial-gradient(circle at 80% 100%, rgba(125,190,157,0.04), transparent 55%)' }}>
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {summary && (
            <div className="mb-1 rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-violet-700 dark:text-violet-200"><Sparkles className="h-3 w-3" /> AI summary</div>
                <button type="button" onClick={() => setSummary(null)} className="text-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-1 whitespace-pre-line text-xs leading-relaxed text-foreground/80">{summary}</div>
            </div>
          )}
          {threadQ.isLoading ? (
            <div className="flex items-center justify-center p-6 text-xs text-foreground/55"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading thread…</div>
          ) : messages.length === 0 ? (
            <ThreadEmpty name={conversation.client_name} onWave={() => sendMut.mutate({ content: '👋' })} sending={sendMut.isPending} />
          ) : (
            items.map((it) =>
              it.kind === 'day'
                ? <DaySeparator key={it.key} label={it.label} />
                : <Bubble key={it.message.id} message={it.message} name={conversation.client_name} avatarUrl={conversation.avatar_url}
                    firstOfGroup={it.firstOfGroup} lastOfGroup={it.lastOfGroup} mySide="admin"
                    onReact={(emoji) => reactMut.mutate({ id: it.message.id, emoji })}
                    onReply={() => setReplyTo(it.message)}
                    onPin={() => pinMut.mutate({ id: it.message.id, pinned: !it.message.metadata?.pinned_at })}
                    onEdit={() => setEditing({ id: it.message.id, text: it.message.content })}
                    onDelete={() => deleteMut.mutate(it.message.id)} />,
            )
          )}
        </div>
      </div>

      <Composer
        name={conversation.client_name}
        draft={editing ? editing.text : draft}
        onDraft={(v) => editing ? setEditing({ ...editing, text: v }) : setDraft(v)}
        onSend={send}
        sending={sendMut.isPending || editMut.isPending}
        editing={!!editing} onCancelEdit={() => setEditing(null)}
        replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
        onAttachClick={() => fileRef.current?.click()} attaching={attaching}
        onMic={toggleMic} recording={recording}
        replies={replies} loadingReplies={loadingReplies} onRunReplies={runReplies} onUseReply={(r) => { setDraft(r); setReplies([]); }}
        quickReplies={quickQ.data ?? []} onUseQuick={(b) => setDraft(b)} onSaveQuick={(b) => saveQRMut.mutate(b)} onDeleteQuick={(id) => delQRMut.mutate(id)}
        onScheduleSend={scheduleSend}
      />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }} />
    </>
  );
}

// ─── Composer ───────────────────────────────────────────────────────

function Composer({ name, draft, onDraft, onSend, sending, editing, onCancelEdit, replyTo, onCancelReply,
  onAttachClick, attaching, onMic, recording, replies, loadingReplies, onRunReplies, onUseReply,
  quickReplies, onUseQuick, onSaveQuick, onDeleteQuick, onScheduleSend }: {
  name: string; draft: string; onDraft: (v: string) => void; onSend: () => void; sending: boolean;
  editing: boolean; onCancelEdit: () => void; replyTo: ThreadMessage | null; onCancelReply: () => void;
  onAttachClick: () => void; attaching: boolean; onMic: () => void; recording: boolean;
  replies: string[]; loadingReplies: boolean; onRunReplies: () => void; onUseReply: (r: string) => void;
  quickReplies: QuickReply[]; onUseQuick: (body: string) => void; onSaveQuick: (body: string) => void; onDeleteQuick: (id: string) => void;
  onScheduleSend: (whenISO: string) => void;
}) {
  const [showQuick, setShowQuick] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  function confirmSchedule() {
    if (!scheduleAt) return;
    const iso = new Date(scheduleAt).toISOString();
    if (new Date(iso).getTime() <= Date.now()) { toast.error('Pick a future time.'); return; }
    onScheduleSend(iso);
    setShowSchedule(false); setScheduleAt('');
  }

  return (
    <div className="border-t border-foreground/[0.06] bg-canvas/85 p-3 backdrop-blur-md md:p-4">
      <div className="mx-auto max-w-3xl">
        {/* Quick replies popover */}
        {showQuick && !editing && (
          <div className="mb-2 rounded-xl border border-foreground/10 bg-canvas p-2 shadow-lg">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">Quick replies</span>
              <button type="button" onClick={() => { if (draft.trim()) onSaveQuick(draft.trim()); }} disabled={!draft.trim()}
                className="inline-flex items-center gap-1 rounded-full border border-foreground/10 px-2 py-0.5 text-[11px] text-foreground/65 hover:bg-foreground/[0.05] disabled:opacity-40">
                <Plus className="h-3 w-3" /> Save current
              </button>
            </div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {quickReplies.length === 0 ? (
                <div className="px-2 py-3 text-center text-[11px] text-foreground/45">No quick replies yet. Type a message and "Save current".</div>
              ) : quickReplies.map((q) => (
                <div key={q.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-foreground/[0.04]">
                  <button type="button" onClick={() => { onUseQuick(q.body); setShowQuick(false); }} className="min-w-0 flex-1 truncate text-left text-xs text-foreground/80">{q.body}</button>
                  <button type="button" onClick={() => onDeleteQuick(q.id)} className="opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5 text-foreground/35 hover:text-rose-500" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Schedule row */}
        {showSchedule && !editing && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-blue-400/20 bg-blue-400/[0.05] px-3 py-2">
            <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 py-1 text-xs focus:outline-none" />
            <button type="button" onClick={confirmSchedule} disabled={!scheduleAt || !draft.trim()}
              className="rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40">Schedule send</button>
            <button type="button" onClick={() => setShowSchedule(false)} className="text-[11px] text-foreground/50 hover:text-foreground">Cancel</button>
          </div>
        )}

        {/* Reply / edit context bar */}
        {(replyTo || editing) && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-[11px]">
            <CornerUpLeft className="h-3 w-3 flex-shrink-0 text-violet-500" />
            <span className="min-w-0 flex-1 truncate text-foreground/70">
              {editing ? 'Editing your message' : <>Replying to <span className="text-foreground/55">{replyTo ? previewOf(replyTo) : ''}</span></>}
            </span>
            <button type="button" onClick={editing ? onCancelEdit : onCancelReply} className="flex-shrink-0 text-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Smart replies */}
        {!editing && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={onRunReplies} disabled={loadingReplies}
              className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 text-[11px] text-foreground/65 hover:bg-foreground/[0.06] disabled:opacity-50">
              {loadingReplies ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Suggest replies
            </button>
            {replies.map((r, i) => (
              <button key={i} type="button" onClick={() => onUseReply(r)}
                className="max-w-xs truncate rounded-full border border-violet-400/30 bg-violet-400/[0.08] px-3 py-1 text-[11px] text-violet-700 hover:bg-violet-400/[0.15] dark:text-violet-200">{r}</button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {!editing && (
            <>
              <button type="button" onClick={onAttachClick} disabled={attaching} title="Attach photo"
                className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50">
                {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <button type="button" onClick={onMic} title={recording ? 'Stop & send' : 'Record voice note'}
                className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-full', recording ? 'bg-rose-500 text-white' : 'text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground')}>
                {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => { setShowQuick((v) => !v); setShowSchedule(false); }} title="Quick replies"
                className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-full', showQuick ? 'bg-foreground/10 text-foreground' : 'text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground')}>
                <Bookmark className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => { setShowSchedule((v) => !v); setShowQuick(false); }} title="Schedule send"
                className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-full', showSchedule ? 'bg-foreground/10 text-foreground' : 'text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground')}>
                <Clock className="h-4 w-4" />
              </button>
            </>
          )}
          <textarea value={draft} onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            rows={1} placeholder={recording ? 'Recording… tap stop to send' : `Message ${name.split(' ')[0]}…`} maxLength={4000}
            className="flex-1 resize-none rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-2.5 text-sm placeholder:text-foreground/45 focus:border-violet-400/60 focus:outline-none" />
          <button type="button" onClick={onSend} disabled={sending || (!draft.trim())}
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.5)] transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100" aria-label="Send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bubble ─────────────────────────────────────────────────────────

interface BubbleProps {
  message: ThreadMessage; name: string; avatarUrl: string | null; firstOfGroup: boolean; lastOfGroup: boolean;
  mySide: 'admin' | 'client';
  onReact: (emoji: string) => void; onReply: () => void; onPin: () => void; onEdit: () => void; onDelete: () => void;
}

export function Bubble({ message, name, avatarUrl, firstOfGroup, lastOfGroup, mySide, onReact, onReply, onPin, onEdit, onDelete }: BubbleProps) {
  const [showReact, setShowReact] = useState(false);
  const mine = message.sender_type === mySide;
  const isSystem = message.sender_type === 'system';
  const meta = message.metadata ?? undefined;
  const deleted = !!meta?.deleted_at;
  const reactions = meta?.reactions ?? {};
  const reactionList = [reactions.admin, reactions.client].filter(Boolean) as string[];

  if (isSystem) {
    return <div className="my-1 self-center rounded-full bg-foreground/[0.05] px-3 py-1 text-[11px] text-foreground/65">{message.content}</div>;
  }

  return (
    <div className={cn('group flex items-end gap-2', mine ? 'justify-end' : 'justify-start', firstOfGroup ? 'mt-2' : 'mt-0.5')}>
      {!mine && <div className="w-7 flex-shrink-0">{lastOfGroup && <Avatar name={name} url={avatarUrl} size={28} />}</div>}

      {/* Hover actions (left of my bubbles) */}
      {mine && !deleted && <BubbleActions mine={mine} onReact={() => setShowReact((v) => !v)} onReply={onReply} onPin={onPin} onEdit={onEdit} onDelete={onDelete} canEdit={message.message_type === 'manual'} />}

      <div className="relative max-w-[78%]">
        {showReact && (
          <div className={cn('absolute -top-9 z-10 flex gap-0.5 rounded-full border border-foreground/10 bg-canvas px-1.5 py-1 shadow-lg', mine ? 'right-0' : 'left-0')}>
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => { onReact(e); setShowReact(false); }} className="rounded-full px-1 text-base hover:scale-125 transition-transform">{e}</button>
            ))}
          </div>
        )}
        <div className={cn('px-3.5 py-2 text-sm leading-relaxed shadow-sm',
          mine ? 'rounded-2xl bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white' : 'rounded-2xl border border-foreground/[0.06] bg-foreground/[0.04] text-foreground/90',
          mine ? (lastOfGroup ? 'rounded-br-md' : '') : (lastOfGroup ? 'rounded-bl-md' : ''))}>
          {/* Reply quote */}
          {meta?.reply && !deleted && (
            <div className={cn('mb-1 rounded-lg border-l-2 px-2 py-1 text-[11px]', mine ? 'border-white/60 bg-white/15 text-white/85' : 'border-violet-400/50 bg-foreground/[0.04] text-foreground/65')}>
              {meta.reply.preview || '…'}
            </div>
          )}

          {deleted ? (
            <p className="italic opacity-70">This message was deleted</p>
          ) : (
            <>
              {message.message_type === 'image' && message.attachment_url && (
                <img src={message.attachment_url} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" />
              )}
              {message.message_type === 'voice' && message.attachment_url && (
                <audio controls src={message.attachment_url} className="mb-1 h-9 w-56 max-w-full" />
              )}
              {message.message_type === 'file' && message.attachment_url && (
                <a href={message.attachment_url} download={message.attachment_name ?? 'file'} className={cn('mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs underline', mine ? 'bg-white/15' : 'bg-foreground/[0.05]')}>
                  <Paperclip className="h-3.5 w-3.5" /> {message.attachment_name ?? 'Attachment'}
                </a>
              )}
              {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
            </>
          )}

          {lastOfGroup && (
            <div className={cn('mt-0.5 flex items-center gap-1 text-[10px]', mine ? 'text-white/65' : 'text-foreground/40')}>
              {new Date(message.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
              {meta?.edited_at && !deleted && <span>· edited</span>}
              {mine && !deleted && (message.is_read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
            </div>
          )}
        </div>

        {/* Reactions */}
        {reactionList.length > 0 && !deleted && (
          <div className={cn('-mt-1 flex gap-0.5', mine ? 'justify-end pr-1' : 'justify-start pl-1')}>
            {reactionList.map((e, i) => (
              <span key={i} className="rounded-full border border-foreground/10 bg-canvas px-1.5 text-[11px] shadow-sm">{e}</span>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions (right of incoming bubbles) */}
      {!mine && !deleted && <BubbleActions mine={mine} onReact={() => setShowReact((v) => !v)} onReply={onReply} onPin={onPin} canEdit={false} />}
    </div>
  );
}

function BubbleActions({ mine, onReact, onReply, onPin, onEdit, onDelete, canEdit }: {
  mine: boolean; onReact: () => void; onReply: () => void; onPin: () => void; onEdit?: () => void; onDelete?: () => void; canEdit: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100', mine ? 'order-first' : '')}>
      <IconBtn title="React" onClick={onReact}><SmilePlus className="h-3.5 w-3.5" /></IconBtn>
      <IconBtn title="Reply" onClick={onReply}><Reply className="h-3.5 w-3.5" /></IconBtn>
      <IconBtn title="Pin" onClick={onPin}><Pin className="h-3.5 w-3.5" /></IconBtn>
      {mine && canEdit && onEdit && <IconBtn title="Edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></IconBtn>}
      {mine && onDelete && <IconBtn title="Delete" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 hover:text-rose-500" /></IconBtn>}
    </div>
  );
}
function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} onClick={onClick} className="grid h-6 w-6 place-items-center rounded-full text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground">{children}</button>;
}

function DaySeparator({ label }: { label: string }) {
  return <div className="my-2 flex items-center justify-center"><span className="rounded-full bg-foreground/[0.06] px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/50">{label}</span></div>;
}

function ThreadEmpty({ name, onWave, sending }: { name: string; onWave: () => void; sending: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-700 dark:text-violet-200"><MessageCircle className="h-5 w-5" /></div>
      <div className="text-sm text-foreground/65">No messages with {name.split(' ')[0]} yet.</div>
      <button type="button" onClick={onWave} disabled={sending} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hand className="h-3.5 w-3.5" />} Say hello
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600/20 to-fuchsia-500/15 text-violet-700 dark:text-violet-200"><MessageCircle className="h-6 w-6" /></div>
      <h2 className="mt-4 text-base font-medium">Select a conversation</h2>
      <p className="mt-1 max-w-sm text-sm text-foreground/65">Pick a client on the left. New messages from clients show up here in real time.</p>
    </motion.div>
  );
}

// ─── Avatar ─────────────────────────────────────────────────────────

function Avatar({ name, url, online, size = 40 }: { name: string; url?: string | null; online?: boolean; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <div className="grid place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-xs font-semibold" style={{ width: size, height: size }}>{initialsOf(name)}</div>
      )}
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-canvas bg-emerald-500" />}
    </div>
  );
}

// ─── Grouping / previews ────────────────────────────────────────────

type RenderItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; message: ThreadMessage; firstOfGroup: boolean; lastOfGroup: boolean };

function groupMessages(messages: ThreadMessage[]): RenderItem[] {
  const out: RenderItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i], prev = messages[i - 1], next = messages[i + 1];
    if (!prev || !sameDay(prev.created_at, m.created_at)) out.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(m.created_at) });
    const firstOfGroup = !prev || prev.sender_type !== m.sender_type || !sameDay(prev.created_at, m.created_at) || gapMin(prev.created_at, m.created_at) > 5;
    const lastOfGroup = !next || next.sender_type !== m.sender_type || !sameDay(next.created_at, m.created_at) || gapMin(m.created_at, next.created_at) > 5;
    out.push({ kind: 'msg', message: m, firstOfGroup, lastOfGroup });
  }
  return out;
}

function previewOf(m: ThreadMessage): string {
  if (m.metadata?.deleted_at) return 'Deleted message';
  if (m.content?.trim()) return m.content.slice(0, 80);
  if (m.message_type === 'image') return '📷 Photo';
  if (m.message_type === 'voice') return '🎤 Voice message';
  if (m.message_type === 'file') return '📎 File';
  return '…';
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function gapMin(a: string, b: string): number { return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 60_000; }
function dayLabel(iso: string): string {
  const d = new Date(iso), today = new Date(), yest = new Date(); yest.setDate(today.getDate() - 1);
  if (sameDay(iso, today.toISOString())) return 'Today';
  if (sameDay(iso, yest.toISOString())) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function presenceOf(lastActiveIso: string | null): { online: boolean; label: string } {
  if (!lastActiveIso) return { online: false, label: 'Offline' };
  const sec = Math.max(0, (Date.now() - new Date(lastActiveIso).getTime()) / 1000);
  if (sec < 120) return { online: true, label: 'Active now' };
  return { online: false, label: `last active ${relativeTime(lastActiveIso)}` };
}

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}
function relativeTime(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.round(sec / 3600)}h ago`;
  if (sec < 604_800) return `${Math.round(sec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

async function downscaleToDataUrl(file: File, max = 1280, quality = 0.82): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i); i.onerror = () => reject(new Error('decode failed')); i.src = raw;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

interface WorkspaceSummary { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName, initials };
}
