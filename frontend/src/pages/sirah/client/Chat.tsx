import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Send, MessageCircle, Sparkles, Loader2, Paperclip, Mic, Square, SmilePlus, Reply, Pencil, Trash2,
  Check, CheckCheck, CornerUpLeft, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger, BrandMark } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type ClientMessage, type MsgAttachment } from '@/modules/workspace/api/clients';
import { useMicRecorder } from '@/modules/workspace/voice-ai/useMicRecorder';
import { cn } from '@/lib/utils';

const REACTIONS = ['👍', '❤️', '😂', '🔥', '🙏', '😮'];

export default function ClientChat() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const nutriQ = useQuery({ queryKey: ['me', 'nutritionist'], queryFn: () => clientsApi.myNutritionist(), staleTime: 5 * 60_000, retry: 1 });
  const nutri = nutriQ.data;
  const messagesQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(100),
    refetchInterval: 5_000, refetchOnWindowFocus: true, retry: 1,
  });

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ClientMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; mine: boolean } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Oldest → newest for natural reading + grouping.
  const messages = useMemo(() => (messagesQ.data ?? []).slice().reverse(), [messagesQ.data]);
  const items = useMemo(() => groupMessages(messages), [messages]);

  // Mark the nutritionist's messages read so their read-receipts update.
  useEffect(() => {
    if (messages.some((m) => m.sender_type === 'admin' && !m.is_read)) {
      clientsApi.markMyMessagesRead().catch(() => undefined);
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  // Belt-and-suspenders against page drift: the client shell already clips its
  // ambient orbs, but the root uses overflow-x-hidden (which makes overflow-y
  // compute to `auto`), so lock the root scroller while the chat is open so the
  // whole conversation pane stays pinned and only the message list scrolls.
  useEffect(() => {
    const root = document.getElementById('root');
    const targets = [document.documentElement, document.body, root].filter(Boolean) as HTMLElement[];
    const prev = targets.map((el) => el.style.overflow);
    targets.forEach((el) => { el.style.overflow = 'hidden'; });
    return () => { targets.forEach((el, i) => { el.style.overflow = prev[i]; }); };
  }, []);

  // Actions are optimistic and reconciled by the background poll — we deliberately
  // do NOT refetch the whole thread on every action (that re-downloads every
  // message incl. base64 attachments and makes each tap feel slow on mobile).
  // Optimistic helpers — the raw cache is DESC (newest first).
  const key = ['me', 'messages'];
  const snap = () => queryClient.getQueryData<ClientMessage[]>(key);
  const patch = (fn: (m: ClientMessage[]) => ClientMessage[]) =>
    queryClient.setQueryData<ClientMessage[]>(key, (old) => (old ? fn(old) : old));
  const rollback = (ctx: { prev?: ClientMessage[] } | undefined) => { if (ctx?.prev) queryClient.setQueryData(key, ctx.prev); };
  const nowISO = () => new Date().toISOString();

  const sendMut = useMutation({
    mutationFn: (opts: { content?: string; attachment?: MsgAttachment; replyTo?: string }) => clientsApi.sendMessage(opts),
    onMutate: (opts) => {
      const prev = snap();
      const att = opts.attachment;
      const tmpId = `tmp_${Math.random().toString(36).slice(2)}`;
      const tmp: ClientMessage = {
        id: tmpId, sender_type: 'client',
        message_type: att ? (att.type.startsWith('image/') ? 'image' : att.type.startsWith('audio/') ? 'voice' : 'file') : 'manual',
        content: opts.content ?? '', is_read: false, created_at: nowISO(),
        metadata: replyTo ? { reply: { id: replyTo.id, sender: replyTo.sender_type, preview: previewOf(replyTo) } } : {},
        attachment_url: att?.url ?? null, attachment_name: att?.name ?? null, attachment_type: att?.type ?? null, attachment_size: att?.size ?? null,
      };
      patch((ms) => [tmp, ...ms]); // DESC
      setDraft(''); setReplyTo(null); // clear the composer instantly — don't wait for the network
      return { prev, tmpId };
    },
    onSuccess: (row, _opts, ctx) => {
      // Swap the optimistic temp for the saved row instead of refetching the thread.
      if (ctx?.tmpId && row) patch((ms) => ms.map((m) => (m.id === ctx.tmpId ? row : m)));
    },
    onError: (err: Error, _v, ctx) => { rollback(ctx); toast.error(err.message ?? 'Could not send.'); },
  });
  const reactMut = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) => clientsApi.reactMyMsg(id, emoji),
    onMutate: ({ id, emoji }) => {
      const prev = snap();
      patch((ms) => ms.map((m) => m.id === id
        ? { ...m, metadata: { ...(m.metadata ?? {}), reactions: { ...(m.metadata?.reactions ?? {}), client: m.metadata?.reactions?.client === emoji ? undefined : emoji } } } : m));
      return { prev };
    },
    onError: (_e, _v, ctx) => rollback(ctx),
  });
  const editMut = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => clientsApi.editMyMsg(id, content),
    onMutate: ({ id, content }) => {
      const prev = snap();
      patch((ms) => ms.map((m) => m.id === id ? { ...m, content, metadata: { ...(m.metadata ?? {}), edited_at: nowISO() } } : m));
      setEditing(null);
      return { prev };
    },
    onError: (_e, _v, ctx) => { rollback(ctx); toast.error('Could not edit.'); },
  });
  const deleteMut = useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: 'me' | 'everyone' }) => clientsApi.deleteMyMsg(id, scope),
    onMutate: ({ id, scope }) => {
      const prev = snap();
      if (scope === 'everyone') patch((ms) => ms.map((m) => m.id === id ? { ...m, content: '', attachment_url: null, metadata: { ...(m.metadata ?? {}), deleted_at: nowISO() } } : m));
      else patch((ms) => ms.filter((m) => m.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { rollback(ctx); toast.error('Could not delete.'); },
  });

  function send() {
    if (editing) { if (editing.text.trim()) editMut.mutate({ id: editing.id, content: editing.text }); return; }
    const body = draft.trim();
    if (!body || sendMut.isPending) return;
    sendMut.mutate({ content: body, replyTo: replyTo?.id });
  }

  async function onPickFile(file: File) {
    setAttaching(true);
    try {
      if (file.type.startsWith('image/')) {
        const url = await downscaleToDataUrl(file, 1280, 0.82);
        sendMut.mutate({ attachment: { url, type: 'image/jpeg', name: file.name, size: url.length }, replyTo: replyTo?.id });
      } else {
        // Non-image files travel as data URLs through the 2 MB JSON body, so cap them.
        if (file.size > 1.4 * 1024 * 1024) { toast.error('File too large — keep it under 1.4 MB.'); return; }
        const url = await blobToDataUrl(file);
        sendMut.mutate({ attachment: { url, type: file.type || 'application/octet-stream', name: file.name, size: file.size }, replyTo: replyTo?.id });
      }
    } catch { toast.error('Could not attach that file.'); }
    finally { setAttaching(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  // silenceMs: null → no voice-activity auto-stop. A chat voice note records
  // until the user taps stop, so a natural pause shouldn't cut it off + send.
  const recorder = useMicRecorder({ silenceMs: null, onAutoStop: (blob) => { void sendVoice(blob); } });
  async function sendVoice(blob: Blob | null) {
    if (!blob || blob.size === 0) return;
    try {
      const url = await blobToDataUrl(blob);
      sendMut.mutate({ attachment: { url, type: blob.type || 'audio/webm', name: 'voice-note', size: blob.size }, replyTo: replyTo?.id });
    } catch { toast.error('Could not send voice note.'); }
  }
  async function toggleMic() {
    if (recorder.status === 'recording') {
      const blob = await recorder.stop();
      // Guard against dead recordings (muted mic / wrong device) — a peak below
      // ~0.01 means no sound was captured, so don't send a silent voice note.
      if (recorder.getPeak() < 0.01) {
        toast.error('No sound was detected — check your microphone and try again.');
        return;
      }
      await sendVoice(blob);
    } else { await recorder.start(); }
  }
  const recording = recorder.status === 'recording';

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="flex h-[calc(100svh-3.5rem-4rem)] w-full flex-col overflow-hidden md:h-[calc(100svh-3.5rem)]">
        {/* Header bar — spans the full content width so the thread never looks like a floating column */}
        <motion.header variants={fadeUp}
          className="flex flex-shrink-0 items-center gap-3 border-b border-foreground/[0.06] bg-canvas/70 px-4 py-3 backdrop-blur-md md:px-8">
          <span className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-foreground/10">
            {nutri?.logo_url
              ? <img src={nutri.logo_url} alt="" className="h-full w-full object-cover" />
              : <BrandMark size={26} animated={false} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight">{nutri?.name ?? 'Your nutritionist'}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground/55">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate">Your nutritionist · {nutri?.tagline ?? 'Usually replies within a day'}</span>
            </div>
          </div>
          <span className="hidden flex-shrink-0 items-center gap-1.5 rounded-full border border-foreground/[0.06] bg-foreground/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground/55 sm:inline-flex">
            <Sparkles className="h-3 w-3 text-teal-500" /> SIRAH LIFE
          </span>
        </motion.header>

        {/* Messages — only this scrolls; content is widened + centered, the bar around it fills */}
        <div ref={scrollRef} className="chat-wallpaper momentum-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl space-y-1.5 px-4 py-5 md:px-8">
            {messages.length === 0 && (
              <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-12 text-center">
                <Glass className="flex max-w-sm flex-col items-center gap-3 px-8 py-10">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-blue)_/_0.15)] to-[hsl(var(--brand-magenta)_/_0.15)] text-teal-600 dark:text-teal-300">
                    <MessageCircle className="h-6 w-6" />
                  </span>
                  <div className="text-base font-medium">Start the conversation</div>
                  <div className="text-sm leading-relaxed text-foreground/55">
                    Say hi to {nutri?.name ?? 'your nutritionist'} 👋 — ask a question, share how you're feeling, or send a meal photo.
                  </div>
                </Glass>
              </div>
            )}
            {items.map((it) =>
              it.kind === 'day'
                ? <DaySeparator key={it.key} label={it.label} />
                : <Bubble key={it.message.id} message={it.message} firstOfGroup={it.firstOfGroup} lastOfGroup={it.lastOfGroup}
                    avatarUrl={nutri?.logo_url ?? null}
                    onReact={(emoji) => reactMut.mutate({ id: it.message.id, emoji })}
                    onReply={() => setReplyTo(it.message)}
                    onEdit={() => setEditing({ id: it.message.id, text: it.message.content })}
                    onDelete={() => setDeleteTarget({ id: it.message.id, mine: it.message.sender_type === 'client' })} />,
            )}
          </div>
        </div>

        {/* Composer — pinned to the bottom, full-width chrome with centered controls */}
        <div className="flex-shrink-0 border-t border-foreground/[0.06] bg-canvas/70 backdrop-blur-md">
          <div className="mx-auto w-full max-w-4xl px-4 py-3 md:px-8">
              {(replyTo || editing) && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-[11px]">
                  <CornerUpLeft className="h-3 w-3 flex-shrink-0 text-teal-500" />
                  <span className="min-w-0 flex-1 truncate text-foreground/70">{editing ? 'Editing your message' : <>Replying to <span className="text-foreground/55">{replyTo ? previewOf(replyTo) : ''}</span></>}</span>
                  <button type="button" onClick={() => editing ? setEditing(null) : setReplyTo(null)} className="flex-shrink-0 text-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              <div className="flex items-end gap-2">
                {!editing && (
                  <>
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={attaching} title="Attach photo or file"
                      className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-foreground/55 hover:bg-foreground/[0.05] disabled:opacity-50">
                      {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </button>
                    <button type="button" onClick={toggleMic} title={recording ? 'Stop & send' : 'Record voice note'}
                      className={cn('grid h-10 w-10 flex-shrink-0 place-items-center rounded-full', recording ? 'bg-rose-500 text-white' : 'text-foreground/55 hover:bg-foreground/[0.05]')}>
                      {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                  </>
                )}
                <textarea value={editing ? editing.text : draft}
                  onChange={(e) => editing ? setEditing({ ...editing, text: e.target.value }) : setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={1} placeholder={recording ? 'Recording… tap stop to send' : 'Message your nutritionist…'}
                  className="flex-1 resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none" />
                <button type="button" onClick={send} disabled={(!draft.trim() && !editing) || sendMut.isPending || editMut.isPending}
                  className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)] disabled:opacity-40" aria-label="Send">
                  {sendMut.isPending || editMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
      </motion.div>
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }} />
      {deleteTarget && (
        <DeleteDialog
          mine={deleteTarget.mine}
          onForMe={() => { deleteMut.mutate({ id: deleteTarget.id, scope: 'me' }); setDeleteTarget(null); }}
          onForEveryone={() => { deleteMut.mutate({ id: deleteTarget.id, scope: 'everyone' }); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </ClientLayout>
  );
}

function DeleteDialog({ mine, onForMe, onForEveryone, onCancel }: { mine: boolean; onForMe: () => void; onForEveryone: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onCancel} />
      <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 w-full max-w-xs overflow-hidden rounded-2xl border border-foreground/10 bg-canvas shadow-2xl ring-1 ring-black/10">
        <div className="border-b border-foreground/[0.06] px-4 py-3 text-sm font-semibold">Delete message?</div>
        <div className="p-1.5">
          {mine && (
            <button type="button" onClick={onForEveryone} className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-500/[0.08] dark:text-rose-400">
              Delete for everyone
            </button>
          )}
          <button type="button" onClick={onForMe} className="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-foreground/[0.05]">Delete for me</button>
          <button type="button" onClick={onCancel} className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-foreground/60 hover:bg-foreground/[0.05]">Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

function Bubble({ message, firstOfGroup, lastOfGroup, avatarUrl, onReact, onReply, onEdit, onDelete }: {
  message: ClientMessage; firstOfGroup: boolean; lastOfGroup: boolean; avatarUrl?: string | null;
  onReact: (e: string) => void; onReply: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [showReact, setShowReact] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const startPress = () => { pressTimer.current = window.setTimeout(() => setSheetOpen(true), 420); };
  const endPress = () => { if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } };
  const mine = message.sender_type === 'client';
  const isSystem = message.sender_type === 'system';
  const meta = message.metadata ?? undefined;
  const deleted = !!meta?.deleted_at;
  const reactions = [meta?.reactions?.admin, meta?.reactions?.client].filter(Boolean) as string[];

  if (isSystem) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl bg-teal-500/10 px-3.5 py-2 text-sm">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-teal-600"><Sparkles className="h-2.5 w-2.5" /> SIRAH LIFE</div>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group flex items-end gap-1.5', mine ? 'justify-end' : 'justify-start', firstOfGroup ? 'mt-2' : '')}>
      {!mine && (
        <div className="w-7 flex-shrink-0">
          {lastOfGroup && (
            <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-foreground/10">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <BrandMark size={18} animated={false} />}
            </span>
          )}
        </div>
      )}
      {mine && !deleted && <Actions onReact={() => setShowReact((v) => !v)} onReply={onReply} onEdit={onEdit} onDelete={onDelete} mine />}
      <div className="relative max-w-[80%]">
        {showReact && (
          <div className={cn('absolute -top-9 z-10 flex gap-0.5 rounded-full border border-foreground/10 bg-canvas px-1.5 py-1 shadow-lg', mine ? 'right-0' : 'left-0')}>
            {REACTIONS.map((e) => <button key={e} type="button" onClick={() => { onReact(e); setShowReact(false); }} className="rounded-full px-1 text-base transition-transform hover:scale-125">{e}</button>)}
          </div>
        )}
        <div
          onTouchStart={deleted ? undefined : startPress} onTouchEnd={endPress} onTouchMove={endPress}
          onContextMenu={deleted ? undefined : (e) => e.preventDefault()}
          className={cn('rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
          mine
            ? 'rounded-br-md bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
            : 'rounded-bl-md border border-foreground/[0.07] bg-white text-foreground/90 dark:border-white/5 dark:bg-[#202c33] dark:text-white/90',
          !firstOfGroup && (mine ? 'rounded-tr-md' : 'rounded-tl-md'))}>
          {meta?.reply && !deleted && (
            <div className={cn('mb-1 rounded-lg border-l-2 px-2 py-1 text-[11px]', mine ? 'border-white/60 bg-white/15 text-white/85' : 'border-teal-400/50 bg-foreground/[0.04] text-foreground/65')}>{meta.reply.preview || '…'}</div>
          )}
          {deleted ? <p className={cn('italic', mine ? 'text-white/70' : 'text-foreground/50')}>This message was deleted</p> : (
            <>
              {message.message_type === 'image' && message.attachment_url && <img src={message.attachment_url} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" />}
              {message.message_type === 'voice' && message.attachment_url && <audio controls src={message.attachment_url} className="mb-1 h-9 w-56 max-w-full" />}
              {message.message_type === 'file' && message.attachment_url && (
                <a href={message.attachment_url} download={message.attachment_name ?? 'file'} className={cn('mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs underline', mine ? 'bg-white/15' : 'bg-foreground/[0.05]')}><Paperclip className="h-3.5 w-3.5" /> {message.attachment_name ?? 'Attachment'}</a>
              )}
              {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
            </>
          )}
          {lastOfGroup && (
            <div className={cn('mt-0.5 flex items-center gap-1 text-[9px] uppercase tracking-[0.16em]', mine ? 'text-white/70' : 'text-foreground/45')}>
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {meta?.edited_at && !deleted && <span>· edited</span>}
              {mine && !deleted && (message.is_read ? <CheckCheck className="h-3.5 w-3.5 text-sky-300" /> : <Check className="h-3 w-3" />)}
            </div>
          )}
        </div>
        {reactions.length > 0 && !deleted && (
          <div className={cn('-mt-1 flex gap-0.5', mine ? 'justify-end pr-1' : 'justify-start pl-1')}>
            {reactions.map((e, i) => <span key={i} className="rounded-full border border-foreground/10 bg-canvas px-1.5 text-[11px] shadow-sm">{e}</span>)}
          </div>
        )}
      </div>
      {!mine && !deleted && <Actions onReact={() => setShowReact((v) => !v)} onReply={onReply} />}

      {/* Mobile long-press action sheet */}
      {sheetOpen && !deleted && (
        <MobileActionSheet mine={mine}
          onClose={() => setSheetOpen(false)}
          onReact={onReact} onReply={onReply} onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

/** Bottom action sheet shown on mobile long-press — react / reply / edit / delete. */
function MobileActionSheet({ mine, onClose, onReact, onReply, onEdit, onDelete }: {
  mine: boolean; onClose: () => void;
  onReact: (e: string) => void; onReply: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end md:hidden">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        className="relative z-10 rounded-t-3xl border-t border-foreground/10 bg-canvas p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-foreground/15" />
        <div className="mb-2 flex items-center justify-around rounded-2xl bg-foreground/[0.04] p-1.5">
          {REACTIONS.map((e) => (
            <button key={e} type="button" onClick={() => { onReact(e); onClose(); }} className="rounded-full px-1 text-2xl transition-transform active:scale-90">{e}</button>
          ))}
        </div>
        <div className="space-y-0.5">
          <SheetItem icon={<Reply className="h-4 w-4" />} label="Reply" onClick={() => { onReply(); onClose(); }} />
          {mine && <SheetItem icon={<Pencil className="h-4 w-4" />} label="Edit" onClick={() => { onEdit(); onClose(); }} />}
          {mine && <SheetItem icon={<Trash2 className="h-4 w-4" />} label="Delete" danger onClick={() => { onDelete(); onClose(); }} />}
        </div>
      </motion.div>
    </div>
  );
}

function SheetItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium active:bg-foreground/[0.06]',
        danger ? 'text-rose-600 dark:text-rose-400' : 'text-foreground/85')}>
      {icon} {label}
    </button>
  );
}

function Actions({ onReact, onReply, onEdit, onDelete, mine }: { onReact: () => void; onReply: () => void; onEdit?: () => void; onDelete?: () => void; mine?: boolean }) {
  return (
    <div className={cn('hidden items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 md:flex', mine ? 'order-first' : '')}>
      <Ico onClick={onReact}><SmilePlus className="h-3.5 w-3.5" /></Ico>
      <Ico onClick={onReply}><Reply className="h-3.5 w-3.5" /></Ico>
      {mine && onEdit && <Ico onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Ico>}
      {mine && onDelete && <Ico onClick={onDelete}><Trash2 className="h-3.5 w-3.5 hover:text-rose-500" /></Ico>}
    </div>
  );
}
function Ico({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="grid h-6 w-6 place-items-center rounded-full text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground">{children}</button>;
}
function DaySeparator({ label }: { label: string }) {
  return <div className="my-2 flex items-center justify-center"><span className="rounded-full bg-foreground/[0.06] px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/50">{label}</span></div>;
}

// ── grouping + helpers ──
type RenderItem = { kind: 'day'; key: string; label: string } | { kind: 'msg'; message: ClientMessage; firstOfGroup: boolean; lastOfGroup: boolean };
function groupMessages(messages: ClientMessage[]): RenderItem[] {
  const out: RenderItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i], prev = messages[i - 1], next = messages[i + 1];
    if (!prev || !sameDay(prev.created_at, m.created_at)) out.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(m.created_at) });
    const firstOfGroup = !prev || prev.sender_type !== m.sender_type || !sameDay(prev.created_at, m.created_at) || gap(prev.created_at, m.created_at) > 5;
    const lastOfGroup = !next || next.sender_type !== m.sender_type || !sameDay(next.created_at, m.created_at) || gap(m.created_at, next.created_at) > 5;
    out.push({ kind: 'msg', message: m, firstOfGroup, lastOfGroup });
  }
  return out;
}
function previewOf(m: ClientMessage): string {
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
function gap(a: string, b: string): number { return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 60_000; }
function dayLabel(iso: string): string {
  const d = new Date(iso), today = new Date(), yest = new Date(); yest.setDate(today.getDate() - 1);
  if (sameDay(iso, today.toISOString())) return 'Today';
  if (sameDay(iso, yest.toISOString())) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
async function downscaleToDataUrl(file: File, max = 1280, quality = 0.82): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('read')); r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new window.Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('decode')); i.src = raw; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('read')); r.readAsDataURL(blob); });
}
