import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Send, MessageCircle, Sparkles, Loader2, Paperclip, Mic, Square, SmilePlus, Reply, Pencil, Trash2,
  Check, CheckCheck, CornerUpLeft, X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi, type ClientMessage, type MsgAttachment } from '@/modules/workspace/api/clients';
import { useMicRecorder } from '@/modules/workspace/voice-ai/useMicRecorder';
import { cn } from '@/lib/utils';

const REACTIONS = ['👍', '❤️', '😂', '🔥', '🙏', '😮'];

export default function ClientChat() {
  const queryClient = useQueryClient();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const messagesQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(100),
    refetchInterval: 15_000, retry: 1,
  });

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ClientMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['me', 'messages'] });

  const sendMut = useMutation({
    mutationFn: (opts: { content?: string; attachment?: MsgAttachment; replyTo?: string }) => clientsApi.sendMessage(opts),
    onSuccess: () => { setDraft(''); setReplyTo(null); invalidate(); },
    onError: (err: Error) => toast.error(err.message ?? 'Could not send.'),
  });
  const reactMut = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string }) => clientsApi.reactMyMsg(id, emoji),
    onSuccess: invalidate,
  });
  const editMut = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => clientsApi.editMyMsg(id, content),
    onSuccess: () => { setEditing(null); invalidate(); },
    onError: () => toast.error('Could not edit.'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => clientsApi.deleteMyMsg(id),
    onSuccess: invalidate, onError: () => toast.error('Could not delete.'),
  });

  function send() {
    if (editing) { if (editing.text.trim()) editMut.mutate({ id: editing.id, content: editing.text }); return; }
    const body = draft.trim();
    if (!body || sendMut.isPending) return;
    sendMut.mutate({ content: body, replyTo: replyTo?.id });
  }

  async function onPickImage(file: File) {
    setAttaching(true);
    try {
      const url = await downscaleToDataUrl(file, 1280, 0.82);
      sendMut.mutate({ attachment: { url, type: 'image/jpeg', name: file.name, size: url.length }, replyTo: replyTo?.id });
    } catch { toast.error('Could not attach that image.'); }
    finally { setAttaching(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const recorder = useMicRecorder({ onAutoStop: (blob) => { void sendVoice(blob); } });
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
  const recording = recorder.status === 'recording';

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-3xl flex-col px-4 py-6 md:h-[calc(100vh-3rem)] md:px-8 md:py-10">
        <motion.div variants={fadeUp} className="mb-4">
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Talk · Chat</span>
          <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Your nutritionist</h1>
        </motion.div>

        <motion.div variants={fadeUp} className="flex flex-1 flex-col overflow-hidden">
          <Glass className="flex flex-1 flex-col overflow-hidden">
            <div ref={scrollRef} className="scrollbar-hide flex-1 space-y-1.5 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <MessageCircle className="h-6 w-6 text-foreground/35" />
                  <div className="text-sm text-foreground/55">No messages yet. Say hi.</div>
                </div>
              )}
              {items.map((it) =>
                it.kind === 'day'
                  ? <DaySeparator key={it.key} label={it.label} />
                  : <Bubble key={it.message.id} message={it.message} firstOfGroup={it.firstOfGroup} lastOfGroup={it.lastOfGroup}
                      onReact={(emoji) => reactMut.mutate({ id: it.message.id, emoji })}
                      onReply={() => setReplyTo(it.message)}
                      onEdit={() => setEditing({ id: it.message.id, text: it.message.content })}
                      onDelete={() => deleteMut.mutate(it.message.id)} />,
              )}
            </div>

            <div className="border-t border-foreground/[0.06] p-3">
              {(replyTo || editing) && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-[11px]">
                  <CornerUpLeft className="h-3 w-3 flex-shrink-0 text-violet-500" />
                  <span className="min-w-0 flex-1 truncate text-foreground/70">{editing ? 'Editing your message' : <>Replying to <span className="text-foreground/55">{replyTo ? previewOf(replyTo) : ''}</span></>}</span>
                  <button type="button" onClick={() => editing ? setEditing(null) : setReplyTo(null)} className="flex-shrink-0 text-foreground/40 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              <div className="flex items-end gap-2">
                {!editing && (
                  <>
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={attaching} title="Attach photo"
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
                  className="flex-1 resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-sm placeholder:text-foreground/40 focus:border-violet-400/50 focus:outline-none" />
                <button type="button" onClick={send} disabled={(!draft.trim() && !editing) || sendMut.isPending || editMut.isPending}
                  className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)] disabled:opacity-40" aria-label="Send">
                  {sendMut.isPending || editMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </Glass>
        </motion.div>
      </motion.div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }} />
    </ClientLayout>
  );
}

function Bubble({ message, firstOfGroup, lastOfGroup, onReact, onReply, onEdit, onDelete }: {
  message: ClientMessage; firstOfGroup: boolean; lastOfGroup: boolean;
  onReact: (e: string) => void; onReply: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [showReact, setShowReact] = useState(false);
  const mine = message.sender_type === 'client';
  const isSystem = message.sender_type === 'system';
  const meta = message.metadata ?? undefined;
  const deleted = !!meta?.deleted_at;
  const reactions = [meta?.reactions?.admin, meta?.reactions?.client].filter(Boolean) as string[];

  if (isSystem) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl bg-violet-500/10 px-3.5 py-2 text-sm">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-violet-600"><Sparkles className="h-2.5 w-2.5" /> SIRAH</div>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group flex items-end gap-1.5', mine ? 'justify-end' : 'justify-start', firstOfGroup ? 'mt-2' : '')}>
      {mine && !deleted && <Actions onReact={() => setShowReact((v) => !v)} onReply={onReply} onEdit={onEdit} onDelete={onDelete} mine />}
      <div className="relative max-w-[80%]">
        {showReact && (
          <div className={cn('absolute -top-9 z-10 flex gap-0.5 rounded-full border border-foreground/10 bg-canvas px-1.5 py-1 shadow-lg', mine ? 'right-0' : 'left-0')}>
            {REACTIONS.map((e) => <button key={e} type="button" onClick={() => { onReact(e); setShowReact(false); }} className="rounded-full px-1 text-base transition-transform hover:scale-125">{e}</button>)}
          </div>
        )}
        <div className={cn('rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
          mine ? 'bg-gradient-to-br from-blue-500/15 to-fuchsia-500/10' : 'bg-foreground/[0.04]')}>
          {meta?.reply && !deleted && (
            <div className="mb-1 rounded-lg border-l-2 border-violet-400/50 bg-foreground/[0.04] px-2 py-1 text-[11px] text-foreground/65">{meta.reply.preview || '…'}</div>
          )}
          {deleted ? <p className="italic text-foreground/50">This message was deleted</p> : (
            <>
              {message.message_type === 'image' && message.attachment_url && <img src={message.attachment_url} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" />}
              {message.message_type === 'voice' && message.attachment_url && <audio controls src={message.attachment_url} className="mb-1 h-9 w-56 max-w-full" />}
              {message.message_type === 'file' && message.attachment_url && (
                <a href={message.attachment_url} download={message.attachment_name ?? 'file'} className="mb-1 flex items-center gap-2 rounded-lg bg-foreground/[0.05] px-2 py-1.5 text-xs underline"><Paperclip className="h-3.5 w-3.5" /> {message.attachment_name ?? 'Attachment'}</a>
              )}
              {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
            </>
          )}
          {lastOfGroup && (
            <div className="mt-0.5 flex items-center gap-1 text-[9px] uppercase tracking-[0.16em] text-foreground/45">
              {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {meta?.edited_at && !deleted && <span>· edited</span>}
              {mine && !deleted && (message.is_read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
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
    </div>
  );
}

function Actions({ onReact, onReply, onEdit, onDelete, mine }: { onReact: () => void; onReply: () => void; onEdit?: () => void; onDelete?: () => void; mine?: boolean }) {
  return (
    <div className={cn('flex items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100', mine ? 'order-first' : '')}>
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
