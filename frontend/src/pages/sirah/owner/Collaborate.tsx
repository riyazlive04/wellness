import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Hash, Plus, Send, Loader2, StickyNote, Pin, Trash2, MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';

import { Glass } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { collaborationApi, type Channel, type TeamMessage, type TeamNote } from '@/modules/workspace/api/collaboration';
import { cn } from '@/lib/utils';

type Tab = 'chat' | 'notes';

export default function OwnerCollaborate() {
  const ws = readWorkspace();
  const [tab, setTab] = useState<Tab>('chat');
  return (
    <OwnerLayout practiceName={ws.practiceName} ownerName={ws.ownerName} initials={ws.initials}
      trialDaysLeft={null} topbarContext="Team collaboration">
      <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-6xl flex-col px-4 py-5 md:px-6">
        <div className="mb-4 flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Team</h1>
          <div className="ml-auto flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] p-1 text-sm">
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
        active ? 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white' : 'text-foreground/65 hover:bg-foreground/[0.05]')}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

// ── Team chat ──────────────────────────────────────────────────────────
function ChatTab() {
  const qc = useQueryClient();
  const channelsQ = useQuery({ queryKey: ['collab', 'channels'], queryFn: collaborationApi.listChannels });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCh, setNewCh] = useState('');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const channels = channelsQ.data ?? [];
  const channelId = activeId ?? channels[0]?.id ?? null;

  const messagesQ = useQuery({
    queryKey: ['collab', 'messages', channelId],
    queryFn: () => collaborationApi.listMessages(channelId!),
    enabled: !!channelId,
    refetchInterval: 10_000,
  });

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messagesQ.data]);

  const sendMut = useMutation({
    mutationFn: (content: string) => collaborationApi.sendMessage(channelId!, content),
    onSuccess: () => { setDraft(''); qc.invalidateQueries({ queryKey: ['collab', 'messages', channelId] }); },
    onError: () => toast.error('Could not send.'),
  });
  const createChMut = useMutation({
    mutationFn: () => collaborationApi.createChannel(newCh.trim()),
    onSuccess: (c) => { setNewCh(''); setCreating(false); setActiveId(c.id); qc.invalidateQueries({ queryKey: ['collab', 'channels'] }); },
    onError: (e: Error) => toast.error(e.message ?? 'Could not create channel.'),
  });

  return (
    <Glass className="flex min-h-0 flex-1 overflow-hidden p-0">
      {/* Channels rail */}
      <div className="flex w-44 flex-col border-r border-foreground/[0.06]">
        <div className="flex items-center justify-between px-3 py-2.5 text-[10px] uppercase tracking-[0.16em] text-foreground/50">
          Channels
          <button type="button" onClick={() => setCreating((v) => !v)} className="text-foreground/40 hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        {creating && (
          <div className="px-2 pb-2">
            <input autoFocus value={newCh} onChange={(e) => setNewCh(e.target.value)} placeholder="channel-name"
              onKeyDown={(e) => { if (e.key === 'Enter' && newCh.trim()) createChMut.mutate(); }}
              className="h-8 w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-2 text-xs focus:outline-none" />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {channels.map((c) => (
            <button key={c.id} type="button" onClick={() => setActiveId(c.id)}
              className={cn('flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm', c.id === channelId ? 'bg-foreground/[0.06] font-medium' : 'text-foreground/70 hover:bg-foreground/[0.03]')}>
              <Hash className="h-3.5 w-3.5 text-foreground/40" /> <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messagesQ.isLoading ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
          ) : (messagesQ.data ?? []).length === 0 ? (
            <div className="py-12 text-center text-xs text-foreground/45">No messages yet — say hello 👋</div>
          ) : (
            (messagesQ.data ?? []).map((m) => <ChatBubble key={m.id} m={m} />)
          )}
        </div>
        <div className="border-t border-foreground/[0.06] p-3">
          <div className="flex items-end gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message the team…"
              onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim() && channelId) sendMut.mutate(draft.trim()); }}
              disabled={!channelId}
              className="h-10 flex-1 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:border-violet-400/50 focus:outline-none" />
            <button type="button" onClick={() => draft.trim() && channelId && sendMut.mutate(draft.trim())} disabled={!draft.trim() || sendMut.isPending}
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white disabled:opacity-40">
              {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </Glass>
  );
}

function ChatBubble({ m }: { m: TeamMessage }) {
  const who = (m.sender_email ?? '').split('@')[0] || 'staff';
  return (
    <div className="flex items-start gap-2.5">
      <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600/30 to-fuchsia-500/20 text-[10px] font-semibold uppercase text-violet-700 dark:text-violet-200">
        {who.slice(0, 2)}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground/80">{who}</span>
          <span className="text-[10px] text-foreground/40">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="mt-0.5 whitespace-pre-line text-sm text-foreground/85">{m.content}</div>
      </div>
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

  const notes = notesQ.data ?? [];

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
      <Glass className="space-y-2 p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title (optional)"
          className="h-9 w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 text-sm focus:outline-none" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Share a note with your team — a handover, a reminder, a decision…"
          className="w-full resize-none rounded-lg border border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-sm focus:border-violet-400/50 focus:outline-none" />
        <div className="flex justify-end">
          <button type="button" onClick={() => body.trim() && addMut.mutate()} disabled={!body.trim() || addMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {addMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add note
          </button>
        </div>
      </Glass>

      {notesQ.isLoading ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
      ) : notes.length === 0 ? (
        <Glass className="p-8 text-center text-xs text-foreground/45">No shared notes yet.</Glass>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => <NoteCard key={n.id} n={n} onPin={() => pinMut.mutate({ id: n.id, pinned: !n.pinned })} onDelete={() => delMut.mutate(n.id)} />)}
        </div>
      )}
    </div>
  );
}

function NoteCard({ n, onPin, onDelete }: { n: TeamNote; onPin: () => void; onDelete: () => void }) {
  const who = (n.author_email ?? '').split('@')[0] || 'staff';
  return (
    <Glass className={cn('group p-4', n.pinned && 'border-amber-400/30')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {n.title && <div className="text-sm font-semibold">{n.title}</div>}
          <div className="mt-0.5 whitespace-pre-line text-sm text-foreground/80">{n.body}</div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={onPin} title={n.pinned ? 'Unpin' : 'Pin'}><Pin className={cn('h-3.5 w-3.5', n.pinned ? 'text-amber-500' : 'text-foreground/30 hover:text-foreground')} /></button>
          <button type="button" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-foreground/30 hover:text-rose-500" /></button>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-foreground/40">{who} · {new Date(n.updated_at).toLocaleDateString()}</div>
    </Glass>
  );
}

interface WS { practiceName: string; ownerName: string; initials: string }
function readWorkspace(): WS {
  let practiceName = 'Your Practice';
  try { const raw = localStorage.getItem('sirah:workspace:draft'); if (raw) { const d = JSON.parse(raw); if (d?.practiceName) practiceName = d.practiceName; } } catch { /* ignore */ }
  const initials = practiceName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SL';
  return { practiceName, ownerName: 'You', initials };
}
