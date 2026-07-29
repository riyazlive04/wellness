import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Plus, Send, Loader2, StickyNote, Pin, Trash2, MessagesSquare, Users, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { supabase } from '@/integrations/supabase/client';
import { collaborationApi, type TeamMessage, type TeamNote } from '@/modules/workspace/api/collaboration';
import { tenancyApi } from '@/modules/workspace/api/tenancy';
import { optimistic } from '@/lib/optimistic';
import { cn } from '@/lib/utils';

type Tab = 'chat' | 'notes';

export default function OwnerCollaborate() {
  const ws = readWorkspace();
  const [tab, setTab] = useState<Tab>('chat');
  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      trialDaysLeft={null} topbarContext="Team collaboration">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col px-3 py-4 md:px-6 md:py-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 md:mb-5">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Collaborate</div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-[28px]">Team space</h1>
            <p className="mt-1 hidden text-sm text-foreground/55 sm:block">Private chat &amp; shared notes for your workspace staff — clients never see this.</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 rounded-full border border-foreground/[0.06] bg-foreground/[0.03] p-1 text-sm">
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
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors',
        active ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'text-foreground/65 hover:bg-foreground/[0.06]')}>
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
  const delChMut = useMutation({
    mutationFn: (id: string) => collaborationApi.deleteChannel(id),
    onSuccess: (_r, id) => {
      if (id === channelId) setActiveId(null);
      qc.invalidateQueries({ queryKey: ['collab', 'channels'] });
      toast.success('Channel deleted.');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Could not delete channel.'),
  });
  function confirmDeleteChannel(c: { id: string; name: string }) {
    if (window.confirm(`Delete #${c.name}? This removes the channel and all its messages for the whole team. This can't be undone.`)) {
      delChMut.mutate(c.id);
    }
  }

  function send() { const t = draft.trim(); if (t && channelId && !sendMut.isPending) sendMut.mutate(t); }

  const railChannels = (
    <>
      {channels.map((c) => (
        <div key={c.id}
          className={cn('group/ch relative flex w-full items-center gap-1.5 rounded-xl pr-1.5 text-sm transition-colors',
            c.id === channelId ? 'bg-teal-100 font-semibold text-teal-900 dark:bg-teal-500/[0.14] dark:text-teal-50' : 'text-foreground/70 hover:bg-foreground/[0.05]')}>
          {c.id === channelId && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))]" />}
          <button type="button" onClick={() => setActiveId(c.id)} className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-2.5 text-left">
            <Hash className={cn('h-3.5 w-3.5 flex-shrink-0', c.id === channelId ? 'text-teal-600 dark:text-teal-300' : 'text-foreground/40')} />
            <span className="truncate">{c.name}</span>
          </button>
          {!!c.message_count && <span className="flex-shrink-0 text-[10px] text-foreground/40 group-hover/ch:hidden">{c.message_count}</span>}
          <button type="button" title="Delete channel" onClick={() => confirmDeleteChannel(c)} disabled={delChMut.isPending}
            className="hidden flex-shrink-0 rounded-lg p-1 text-foreground/35 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40 group-hover/ch:block">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </>
  );

  // Workspace staff roster — so you can see who else is on the team while chatting.
  const membersQ = useQuery({ queryKey: ['tenancy', 'members'], queryFn: tenancyApi.listMembers, retry: 1 });
  const members = (membersQ.data ?? []).filter((mem) => mem.status === 'active');
  const railMembers = (
    <>
      {members.map((mem) => {
        const isMe = (!!myId && mem.user_id === myId) || (!!myEmail && mem.email === myEmail);
        return (
          <div key={mem.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-foreground/[0.04]">
            <span className={cn('grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg text-[9px] font-bold uppercase', avaTint(mem.email))}>
              {nameOf(mem.email).slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-semibold text-foreground/85">{nameOf(mem.email)}{isMe && ' · you'}</div>
              <div className="truncate text-[10px] text-foreground/45">{roleLabel(mem.role)}</div>
            </div>
          </div>
        );
      })}
    </>
  );

  return (
    <Glass className="flex min-h-0 flex-1 overflow-hidden rounded-3xl border-foreground/[0.06] p-0 shadow-sm">
      {/* Channels rail - desktop */}
      <div className="hidden w-52 flex-col border-r border-foreground/[0.06] bg-foreground/[0.015] md:flex">
        <div className="flex items-center justify-between px-3.5 pb-1.5 pt-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Channels</span>
          <button type="button" onClick={() => setCreating((v) => !v)} title="New channel"
            className="grid h-7 w-7 place-items-center rounded-xl bg-foreground/[0.04] text-foreground/45 transition-colors hover:bg-foreground/[0.08] hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        {creating && (
          <div className="px-2.5 pb-2">
            <div className="flex items-center gap-1 rounded-xl border border-foreground/10 bg-canvas px-2">
              <Hash className="h-3.5 w-3.5 flex-shrink-0 text-foreground/35" />
              <input autoFocus value={newCh} onChange={(e) => setNewCh(e.target.value.replace(/\s+/g, '-').toLowerCase())} placeholder="channel-name"
                onKeyDown={(e) => { if (e.key === 'Enter' && newCh.trim()) createChMut.mutate(newCh); if (e.key === 'Escape') { setCreating(false); setNewCh(''); } }}
                className="h-8 w-full bg-transparent text-xs focus:outline-none" />
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {/* Channels */}
          <div className="space-y-0.5 px-2">
            {channelsQ.isLoading ? (
              <div className="py-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-foreground/30" /></div>
            ) : channels.length === 0 ? (
              <div className="px-2 py-6 text-center text-[11px] text-foreground/45">No channels yet.</div>
            ) : railChannels}
          </div>

          {/* Members - your workspace staff */}
          <div className="mt-4 flex items-center justify-between px-3.5 pb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">Members</span>
            {members.length > 0 && <span className="rounded-full bg-foreground/[0.05] px-1.5 text-[10px] font-semibold text-foreground/45">{members.length}</span>}
          </div>
          <div className="space-y-0.5 px-2">
            {membersQ.isLoading ? (
              <div className="py-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-foreground/30" /></div>
            ) : members.length === 0 ? (
              <div className="px-2 py-4 text-center text-[11px] text-foreground/45">No teammates yet.</div>
            ) : railMembers}
          </div>
        </div>
      </div>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile channel chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-foreground/[0.06] px-3 py-2.5 md:hidden">
          {channels.map((c) => (
            <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
              className={cn('inline-flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold',
                c.id === channelId ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-sm' : 'border border-foreground/[0.08] text-foreground/65')}>
              <Hash className="h-3 w-3" />{c.name}
            </button>
          ))}
          <button type="button" onClick={() => setCreating((v) => !v)} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border border-foreground/[0.08] text-foreground/55"><Plus className="h-3.5 w-3.5" /></button>
          {creating && (
            <input autoFocus value={newCh} onChange={(e) => setNewCh(e.target.value.replace(/\s+/g, '-').toLowerCase())} placeholder="channel-name"
              onKeyDown={(e) => { if (e.key === 'Enter' && newCh.trim()) createChMut.mutate(newCh); }}
              className="h-7 w-28 flex-shrink-0 rounded-full border border-foreground/10 bg-canvas px-2.5 text-xs focus:outline-none" />
          )}
        </div>

        {/* Channel header */}
        {activeChannel && (
          <div className="flex items-center gap-2.5 border-b border-foreground/[0.06] px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-500/[0.14] dark:text-teal-200"><Hash className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{activeChannel.name}</div>
              <div className="truncate text-[11px] text-foreground/50">{activeChannel.description || 'Team channel'}</div>
            </div>
          </div>
        )}

        {!channelId ? (
          <NoChannels onCreate={() => createChMut.mutate('general')} creating={createChMut.isPending} />
        ) : (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3 md:px-4">
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
                  className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none" />
                <button type="button" onClick={send} disabled={!draft.trim() || sendMut.isPending}
                  className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.5)] transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100" aria-label="Send">
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
    <div className={cn('group flex gap-2.5 px-1', mine ? 'flex-row-reverse' : 'flex-row', firstOfGroup ? 'mt-3' : 'mt-0.5')}>
      <div className="w-9 flex-shrink-0">
        {firstOfGroup
          ? <Avatar email={m.sender_email} mine={mine} />
          : <span className="mt-0.5 hidden text-center text-[9px] leading-5 text-foreground/35 group-hover:block">{time}</span>}
      </div>
      <div className={cn('flex min-w-0 max-w-[80%] flex-col', mine ? 'items-end' : 'items-start')}>
        {firstOfGroup && (
          <div className={cn('mb-1 flex items-baseline gap-2', mine && 'flex-row-reverse')}>
            <span className={cn('text-xs font-bold', mine ? 'text-teal-600 dark:text-teal-300' : 'text-foreground/85')}>{who}</span>
            {roleLabel(m.sender_role) && (
              <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground/50">
                {roleLabel(m.sender_role)}
              </span>
            )}
            <span className="text-[10px] text-foreground/40">{time}</span>
          </div>
        )}
        <div className={cn('whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          mine
            ? 'rounded-tr-md bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
            : 'rounded-tl-md border border-foreground/[0.06] bg-card text-foreground/90')}>
          {m.content}
        </div>
      </div>
    </div>
  );
}

function Avatar({ email, mine }: { email?: string | null; mine?: boolean }) {
  return (
    <div className={cn('grid h-9 w-9 place-items-center rounded-xl text-[11px] font-bold uppercase',
      mine ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white' : avaTint(email))}>
      {nameOf(email).slice(0, 2)}
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return <div className="my-3 flex items-center justify-center"><span className="rounded-full border border-foreground/[0.06] bg-foreground/[0.04] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/50">{label}</span></div>;
}

function ThreadEmpty({ channel }: { channel: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-200"><Hash className="h-6 w-6" /></div>
      <div>
        <div className="text-sm font-bold">Welcome to #{channel}</div>
        <div className="mt-0.5 text-xs text-foreground/55">This is the start of the channel. Say hello to your team 👋</div>
      </div>
    </div>
  );
}

function NoChannels({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-200"><Users className="h-7 w-7" /></div>
      <h2 className="mt-4 text-base font-bold">Start your team space</h2>
      <p className="mt-1 max-w-sm text-sm text-foreground/60">Create a channel to chat privately with your workspace staff. Try a <span className="font-semibold">#general</span> to begin.</p>
      <button type="button" onClick={onCreate} disabled={creating}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-50">
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
  // Optimistic: the note pins/unpins (and re-sorts to the top) instantly.
  const pinMut = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => collaborationApi.updateNote(id, { pinned }),
    ...optimistic<TeamNote[], { id: string; pinned: boolean }>(
      qc,
      ['collab', 'notes'],
      (old, v) => old.map((n) => (n.id === v.id ? { ...n, pinned: v.pinned } : n)),
      { errorMessage: 'Could not update the note.' },
    ),
  });
  const delMut = useMutation({ mutationFn: (id: string) => collaborationApi.deleteNote(id), onSuccess: invalidate });

  // Pinned notes float to the top.
  const notes = useMemo(() => (notesQ.data ?? []).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned)), [notesQ.data]);

  return (
    <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto pb-4">
      <Glass className="space-y-2.5 rounded-3xl border-foreground/[0.06] p-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]"><StickyNote className="h-3.5 w-3.5" /> New shared note</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
          className="h-10 w-full rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3.5 text-sm font-semibold focus:border-teal-400/50 focus:outline-none" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Share a handover, a reminder, a decision… visible to all staff."
          className="w-full resize-none rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] px-3.5 py-2.5 text-sm focus:border-teal-400/50 focus:outline-none" />
        <div className="flex justify-end">
          <button type="button" onClick={() => body.trim() && addMut.mutate()} disabled={!body.trim() || addMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100">
            {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add note
          </button>
        </div>
      </Glass>

      {notesQ.isLoading ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
      ) : notes.length === 0 ? (
        <Glass className="flex flex-col items-center gap-2 rounded-3xl border-foreground/[0.06] p-10 text-center shadow-sm">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.20)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-700 dark:text-teal-200"><Sparkles className="h-5 w-5" /></div>
          <div className="text-sm font-semibold text-foreground/70">No shared notes yet.</div>
          <div className="text-xs text-foreground/45">Pin important handovers and SOPs here for the whole team.</div>
        </Glass>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => <NoteCard key={n.id} n={n} onPin={() => pinMut.mutate({ id: n.id, pinned: !n.pinned })} onDelete={() => delMut.mutate(n.id)} />)}
        </div>
      )}
    </div>
  );
}

function NoteCard({ n, onPin, onDelete }: { n: TeamNote; onPin: () => void; onDelete: () => void }) {
  const who = nameOf(n.author_email);
  return (
    <Glass className={cn('group flex flex-col rounded-3xl border-foreground/[0.06] p-4 shadow-sm transition-shadow hover:shadow-md',
      n.pinned && 'border-amber-400/40 bg-amber-100/60 dark:bg-amber-500/[0.10]')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {n.title && <div className="flex items-center gap-1.5 text-sm font-bold">{n.pinned && <Pin className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />}{n.title}</div>}
          <div className="mt-1 whitespace-pre-line break-words text-sm text-foreground/80">{n.body}</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={onPin} title={n.pinned ? 'Unpin' : 'Pin'} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-foreground/[0.06]"><Pin className={cn('h-3.5 w-3.5', n.pinned ? 'text-amber-500' : 'text-foreground/35')} /></button>
          <button type="button" onClick={onDelete} title="Delete" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-foreground/[0.06]"><Trash2 className="h-3.5 w-3.5 text-foreground/35 hover:text-rose-500" /></button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-foreground/[0.05] pt-2.5 text-[10px] text-foreground/45">
        <span className={cn('grid h-5 w-5 place-items-center rounded-md text-[8px] font-bold uppercase', avaTint(n.author_email))}>{who.slice(0, 2)}</span>
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
/** Deterministic pastel tint (with dark variant) for an avatar chip, keyed off the email. */
const AVA_TINTS = [
  'bg-teal-100 text-teal-700 dark:bg-teal-500/[0.16] dark:text-teal-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/[0.16] dark:text-sky-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/[0.16] dark:text-violet-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/[0.16] dark:text-amber-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/[0.16] dark:text-emerald-200',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/[0.16] dark:text-rose-200',
];
function avaTint(seed?: string | null): string {
  const s = seed ?? '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVA_TINTS[h % AVA_TINTS.length];
}
/** Friendly label for a workspace_member role, e.g. assistant_nutritionist → "Assistant". */
function roleLabel(role?: string | null): string | null {
  if (!role) return null;
  const map: Record<string, string> = {
    owner: 'Owner', manager: 'Manager', nutritionist: 'Nutritionist',
    assistant_nutritionist: 'Assistant', receptionist: 'Reception', coach: 'Coach', support: 'Support',
  };
  return map[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

interface WS { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
