import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Plus, Send, Loader2, StickyNote, Pin, Trash2, MessagesSquare, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { supabase } from '@/integrations/supabase/client';
import { collaborationApi, type TeamMessage, type TeamNote } from '@/modules/workspace/api/collaboration';
import { cn } from '@/lib/utils';

type Tab = 'chat' | 'notes';

export default function OwnerCollaborate() {
  const ws = readWorkspace();
  const [tab, setTab] = useState<Tab>('chat');
  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      trialDaysLeft={null} topbarContext="Team collaboration">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col px-3 py-4 md:px-6 md:py-5">
        <div className="mb-3 flex items-center gap-3 md:mb-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Team space</h1>
            <p className="hidden text-xs text-foreground/55 sm:block">Private chat &amp; shared notes for your workspace staff — clients never see this.</p>
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] p-1 text-sm">
            <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')} icon={MessagesSquare} label="Chat" />
            <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')} icon={StickyNote} label="Notes" />
          </div>
        </div>
        {tab === 'chat' ? <ChatTab /> : <NotesTab />}
      </div>
    </OwnerLayout>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Hash; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'text-foreground/65 hover:bg-foreground/[0.05]')}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

// ── Team chat ──────────────────────────────────────────────────────────
function ChatTab() {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ['auth', 'me'], queryFn: async () => (await supabase.auth.getUser()).data.user, staleTime: 5 * 60_000 });
  const myId = meQ.data?.id ?? null;
  const myEmail = meQ.data?.email ?? null;

  const channelsQ = useQuery({ queryKey: ['collab', 'channels'], queryFn: collaborationApi.listChannels });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCh, setNewCh] = useState('');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const channels = channelsQ.data ?? [];
  const channelId = activeId ?? channels[0]?.id ?? null;
  const activeChannel = channels.find((c) => c.id === channelId) ?? null;

  const messagesQ = useQuery({
    queryKey: ['collab', 'messages', channelId],
    queryFn: () => collaborationApi.listMessages(channelId!),
    enabled: !!channelId,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });
  const messages = messagesQ.data ?? [];
  const items = useMemo(() => groupMessages(messages), [messages]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages.length, channelId]);

  const msgKey = ['collab', 'messages', channelId];
  const sendMut = useMutation({
    mutationFn: (content: string) => collaborationApi.sendMessage(channelId!, content),
    onMutate: (content) => {
      const prev = qc.getQueryData<TeamMessage[]>(msgKey);
      const tmpId = `tmp_${Math.random().toString(36).slice(2)}`;
      const tmp: TeamMessage = { id: tmpId, channel_id: channelId!, sender_id: myId, content, created_at: new Date().toISOString(), sender_email: myEmail };
      qc.setQueryData<TeamMessage[]>(msgKey, (old) => [...(old ?? []), tmp]);
      setDraft('');
      return { prev, tmpId };
    },
    onSuccess: (row, _c, ctx) => { if (ctx?.tmpId && row) qc.setQueryData<TeamMessage[]>(msgKey, (old) => (old ?? []).map((m) => (m.id === ctx.tmpId ? row : m))); },
    onError: (_e, _c, ctx) => { if (ctx?.prev) qc.setQueryData(msgKey, ctx.prev); toast.error('Could not send.'); },
  });
  const createChMut = useMutation({
    mutationFn: (name: string) => collaborationApi.createChannel(name.trim()),
    onSuccess: (c) => { setNewCh(''); setCreating(false); setActiveId(c.id); qc.invalidateQueries({ queryKey: ['collab', 'channels'] }); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not create channel.'),
  });

  function send() { const t = draft.trim(); if (t && channelId && !sendMut.isPending) sendMut.mutate(t); }

  const railChannels = (
    <>
      {channels.map((c) => (
        <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
          className={cn('group/ch relative flex w-full items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
            c.id === channelId ? 'bg-teal-500/[0.10] font-medium text-foreground' : 'text-foreground/70 hover:bg-foreground/[0.04]')}>
          {c.id === channelId && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gradient-to-b from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]" />}
          <Hash className={cn('h-3.5 w-3.5 flex-shrink-0', c.id === channelId ? 'text-teal-500' : 'text-foreground/40')} />
          <span className="truncate">{c.name}</span>
          {!!c.message_count && <span className="ml-auto flex-shrink-0 text-[10px] text-foreground/40">{c.message_count}</span>}
        </button>
      ))}
    </>
  );

  return (
    <Glass className="flex min-h-0 flex-1 overflow-hidden p-0">
      {/* Channels rail — desktop */}
      <div className="hidden w-52 flex-col border-r border-foreground/[0.06] bg-foreground/[0.015] md:flex">
        <div className="flex items-center justify-between px-3.5 pb-1 pt-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/45">Channels</span>
          <button type="button" onClick={() => setCreating((v) => !v)} title="New channel"
            className="grid h-6 w-6 place-items-center rounded-lg text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        {creating && (
          <div className="px-2.5 pb-2">
            <div className="flex items-center gap-1 rounded-lg border border-foreground/10 bg-canvas px-2">
              <Hash className="h-3.5 w-3.5 flex-shrink-0 text-foreground/35" />
              <input autoFocus value={newCh} onChange={(e) => setNewCh(e.target.value.replace(/\s+/g, '-').toLowerCase())} placeholder="channel-name"
                onKeyDown={(e) => { if (e.key === 'Enter' && newCh.trim()) createChMut.mutate(newCh); if (e.key === 'Escape') { setCreating(false); setNewCh(''); } }}
                className="h-8 w-full bg-transparent text-xs focus:outline-none" />
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {channelsQ.isLoading ? (
            <div className="py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-foreground/30" /></div>
          ) : channels.length === 0 ? (
            <div className="px-2 py-6 text-center text-[11px] text-foreground/45">No channels yet.</div>
          ) : railChannels}
        </div>
      </div>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile channel chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-foreground/[0.06] px-3 py-2 md:hidden">
          {channels.map((c) => (
            <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
              className={cn('inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs',
                c.id === channelId ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white' : 'border border-foreground/10 text-foreground/65')}>
              <Hash className="h-3 w-3" />{c.name}
            </button>
          ))}
          <button type="button" onClick={() => setCreating((v) => !v)} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border border-foreground/10 text-foreground/55"><Plus className="h-3.5 w-3.5" /></button>
          {creating && (
            <input autoFocus value={newCh} onChange={(e) => setNewCh(e.target.value.replace(/\s+/g, '-').toLowerCase())} placeholder="channel-name"
              onKeyDown={(e) => { if (e.key === 'Enter' && newCh.trim()) createChMut.mutate(newCh); }}
              className="h-7 w-28 flex-shrink-0 rounded-full border border-foreground/10 bg-canvas px-2.5 text-xs focus:outline-none" />
          )}
        </div>

        {/* Channel header */}
        {activeChannel && (
          <div className="flex items-center gap-2 border-b border-foreground/[0.06] px-4 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-foreground/[0.05] text-foreground/55"><Hash className="h-3.5 w-3.5" /></span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{activeChannel.name}</div>
              <div className="truncate text-[11px] text-foreground/50">{activeChannel.description || 'Team channel'}</div>
            </div>
          </div>
        )}

        {!channelId ? (
          <NoChannels onCreate={() => createChMut.mutate('general')} creating={createChMut.isPending} />
        ) : (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3 md:px-3">
              {messagesQ.isLoading ? (
                <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
              ) : messages.length === 0 ? (
                <ThreadEmpty channel={activeChannel?.name ?? 'this channel'} />
              ) : (
                items.map((it) =>
                  it.kind === 'day'
                    ? <DaySeparator key={it.key} label={it.label} />
                    : <ChatRow key={it.message.id} m={it.message} firstOfGroup={it.firstOfGroup} mine={isMine(it.message, myId, myEmail)} />,
                )
              )}
            </div>
            <div className="border-t border-foreground/[0.06] bg-canvas/70 p-3 backdrop-blur-md">
              <div className="flex items-end gap-2">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={activeChannel ? `Message #${activeChannel.name}…` : 'Message the team…'}
                  className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-4 py-2.5 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none" />
                <button type="button" onClick={send} disabled={!draft.trim() || sendMut.isPending}
                  className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.5)] transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100" aria-label="Send">
                  {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Glass>
  );
}

function ChatRow({ m, firstOfGroup, mine }: { m: TeamMessage; firstOfGroup: boolean; mine: boolean }) {
  const who = mine ? 'You' : nameOf(m.sender_email);
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={cn('group flex gap-2.5 rounded-xl px-2 hover:bg-foreground/[0.025]', firstOfGroup ? 'mt-2 py-1' : 'py-0.5')}>
      <div className="w-9 flex-shrink-0">
        {firstOfGroup
          ? <Avatar email={m.sender_email} mine={mine} />
          : <span className="mt-0.5 hidden text-right text-[9px] leading-5 text-foreground/35 group-hover:block">{time}</span>}
      </div>
      <div className="min-w-0 flex-1">
        {firstOfGroup && (
          <div className="flex items-baseline gap-2">
            <span className={cn('text-xs font-semibold', mine ? 'text-teal-600 dark:text-teal-300' : 'text-foreground/85')}>{who}</span>
            <span className="text-[10px] text-foreground/40">{time}</span>
          </div>
        )}
        <div className="whitespace-pre-line break-words text-sm text-foreground/85">{m.content}</div>
      </div>
    </div>
  );
}

function Avatar({ email, mine }: { email?: string | null; mine?: boolean }) {
  return (
    <div className={cn('grid h-9 w-9 place-items-center rounded-full text-[11px] font-semibold uppercase',
      mine ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white' : 'bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-teal-700 dark:text-teal-200')}>
      {nameOf(email).slice(0, 2)}
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return <div className="my-2 flex items-center justify-center"><span className="rounded-full bg-foreground/[0.06] px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/50">{label}</span></div>;
}

function ThreadEmpty({ channel }: { channel: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-200"><Hash className="h-5 w-5" /></div>
      <div>
        <div className="text-sm font-medium">Welcome to #{channel}</div>
        <div className="mt-0.5 text-xs text-foreground/55">This is the start of the channel. Say hello to your team 👋</div>
      </div>
    </div>
  );
}

function NoChannels({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-200"><Users className="h-6 w-6" /></div>
      <h2 className="mt-4 text-base font-semibold">Start your team space</h2>
      <p className="mt-1 max-w-sm text-sm text-foreground/60">Create a channel to chat privately with your workspace staff. Try a <span className="font-medium">#general</span> to begin.</p>
      <button type="button" onClick={onCreate} disabled={creating}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create #general
      </button>
    </div>
  );
}

// ── Shared notes ───────────────────────────────────────────────────────
function NotesTab() {
  const qc = useQueryClient();
  const notesQ = useQuery({ queryKey: ['collab', 'notes'], queryFn: collaborationApi.listNotes });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['collab', 'notes'] });

  const addMut = useMutation({
    mutationFn: () => collaborationApi.createNote(body.trim(), title.trim() || undefined),
    onSuccess: () => { setTitle(''); setBody(''); invalidate(); },
    onError: () => toast.error('Could not save note.'),
  });
  const pinMut = useMutation({ mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => collaborationApi.updateNote(id, { pinned }), onSuccess: invalidate });
  const delMut = useMutation({ mutationFn: (id: string) => collaborationApi.deleteNote(id), onSuccess: invalidate });

  // Pinned notes float to the top.
  const notes = useMemo(() => (notesQ.data ?? []).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned)), [notesQ.data]);

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
      <Glass className="space-y-2 p-3.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/45"><StickyNote className="h-3 w-3" /> New shared note</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
          className="h-9 w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm font-medium focus:border-teal-400/50 focus:outline-none" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Share a handover, a reminder, a decision… visible to all staff."
          className="w-full resize-none rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-teal-400/50 focus:outline-none" />
        <div className="flex justify-end">
          <button type="button" onClick={() => body.trim() && addMut.mutate()} disabled={!body.trim() || addMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add note
          </button>
        </div>
      </Glass>

      {notesQ.isLoading ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
      ) : notes.length === 0 ? (
        <Glass className="flex flex-col items-center gap-2 p-10 text-center">
          <Sparkles className="h-5 w-5 text-foreground/35" />
          <div className="text-sm text-foreground/55">No shared notes yet.</div>
          <div className="text-xs text-foreground/40">Pin important handovers and SOPs here for the whole team.</div>
        </Glass>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => <NoteCard key={n.id} n={n} onPin={() => pinMut.mutate({ id: n.id, pinned: !n.pinned })} onDelete={() => delMut.mutate(n.id)} />)}
        </div>
      )}
    </div>
  );
}

function NoteCard({ n, onPin, onDelete }: { n: TeamNote; onPin: () => void; onDelete: () => void }) {
  const who = nameOf(n.author_email);
  return (
    <Glass className={cn('group flex flex-col p-4 transition-shadow hover:shadow-md', n.pinned && 'border-amber-400/40 bg-amber-400/[0.04]')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {n.title && <div className="flex items-center gap-1.5 text-sm font-semibold">{n.pinned && <Pin className="h-3 w-3 flex-shrink-0 text-amber-500" />}{n.title}</div>}
          <div className="mt-1 whitespace-pre-line break-words text-sm text-foreground/80">{n.body}</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={onPin} title={n.pinned ? 'Unpin' : 'Pin'} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-foreground/[0.06]"><Pin className={cn('h-3.5 w-3.5', n.pinned ? 'text-amber-500' : 'text-foreground/35')} /></button>
          <button type="button" onClick={onDelete} title="Delete" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-foreground/[0.06]"><Trash2 className="h-3.5 w-3.5 text-foreground/35 hover:text-rose-500" /></button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-foreground/[0.05] pt-2 text-[10px] text-foreground/45">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.25)] to-[hsl(var(--brand-magenta)_/_0.20)] text-[7px] font-semibold uppercase text-teal-700 dark:text-teal-200">{who.slice(0, 2)}</span>
        {who} · {new Date(n.updated_at).toLocaleDateString()}
      </div>
    </Glass>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────
type RenderItem = { kind: 'day'; key: string; label: string } | { kind: 'msg'; message: TeamMessage; firstOfGroup: boolean };
function groupMessages(messages: TeamMessage[]): RenderItem[] {
  const out: RenderItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i], prev = messages[i - 1];
    if (!prev || !sameDay(prev.created_at, m.created_at)) out.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(m.created_at) });
    const firstOfGroup = !prev || prev.sender_id !== m.sender_id || !sameDay(prev.created_at, m.created_at) || gapMin(prev.created_at, m.created_at) > 5;
    out.push({ kind: 'msg', message: m, firstOfGroup });
  }
  return out;
}
function isMine(m: TeamMessage, myId: string | null, myEmail: string | null): boolean {
  if (myId && m.sender_id) return m.sender_id === myId;
  if (myEmail && m.sender_email) return m.sender_email === myEmail;
  return false;
}
function nameOf(email?: string | null): string { return (email ?? '').split('@')[0] || 'staff'; }
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

interface WS { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
