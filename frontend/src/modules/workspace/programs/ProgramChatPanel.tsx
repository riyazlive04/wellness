import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';

import type { ProgramChatMessage } from '@/modules/workspace/api/programEngine';
import { cn } from '@/lib/utils';

/**
 * Program group chat — one shared room per program, used by BOTH portals.
 *
 * The owner (nutritionist) and every enrolled client see the same messages and
 * each other's names; it is a true group chat, not a broadcast. This component
 * is deliberately dumb about WHO the viewer is — the two pages pass:
 *   - `list` / `send`: the right API surface (owner vs client endpoints)
 *   - `isMine`: how to tell the viewer's own messages from everyone else's
 *     (owner ⇒ "any staff message"; client ⇒ "my client_id")
 * so the same UI serves both without knowing which side it's on.
 *
 * Reads poll every 5s (same cadence as the 1:1 threads); sends are optimistic.
 */
export function ProgramChatPanel({
  queryKey,
  list,
  send,
  isMine,
  memberHint,
  emptyHint = 'No messages yet. Say hello to the group.',
}: {
  queryKey: unknown[];
  list: () => Promise<ProgramChatMessage[]>;
  send: (content: string) => Promise<ProgramChatMessage>;
  isMine: (m: ProgramChatMessage) => boolean;
  /** Small caption under the header, e.g. "You + 12 clients". */
  memberHint?: string;
  emptyHint?: string;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messagesQ = useQuery({
    queryKey,
    queryFn: list,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const messages = messagesQ.data ?? [];

  const snap = () => qc.getQueryData<ProgramChatMessage[]>(queryKey);
  const sendMut = useMutation({
    mutationFn: (content: string) => send(content),
    onMutate: (content) => {
      const prev = snap();
      const tmp: ProgramChatMessage = {
        id: `tmp_${Math.random().toString(36).slice(2)}`,
        template_id: '', sender_user_id: null, sender_client_id: null,
        // Optimistic bubble: mark it so isMine() lights it up on the right.
        sender_role: 'client', sender_name: 'You', content,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<ProgramChatMessage[]>(queryKey, (old) => [...(old ?? []), { ...tmp, __optimistic: true } as ProgramChatMessage]);
      setDraft('');
      return { prev };
    },
    onSuccess: (row, _c, ctx) => {
      // Swap the temp for the saved row rather than refetch the whole room.
      qc.setQueryData<ProgramChatMessage[]>(queryKey, (old) =>
        (old ?? []).map((m) => ((m as ProgramChatMessage & { __optimistic?: boolean }).__optimistic ? row : m)));
      void ctx;
    },
    onError: (_e, _c, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error('Could not send. Try again.');
    },
  });

  // Optimistic rows carry a flag so isMine() aligns them right immediately.
  const mineOf = (m: ProgramChatMessage) => (m as ProgramChatMessage & { __optimistic?: boolean }).__optimistic || isMine(m);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  function submit() {
    const body = draft.trim();
    if (!body || sendMut.isPending) return;
    sendMut.mutate(body);
  }

  const grouped = useMemo(() => groupByDay(messages), [messages]);

  return (
    <div className="flex h-[min(72vh,640px)] flex-col overflow-hidden rounded-2xl border border-foreground/[0.08] bg-canvas">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-foreground/[0.06] px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-300">
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">Program chat</div>
          <div className="truncate text-[11px] text-foreground/50">{memberHint ?? 'Everyone enrolled in this program'}</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {messagesQ.isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-foreground/50">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading chat…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-foreground/[0.04] text-foreground/40">
              <Users className="h-5 w-5" />
            </span>
            <p className="text-sm text-foreground/55">{emptyHint}</p>
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.key}>
              <DayDivider label={g.label} />
              {g.items.map((m, i) => (
                <ChatRow
                  key={m.id}
                  m={m}
                  mine={mineOf(m)}
                  showName={!mineOf(m) && (i === 0 || g.items[i - 1].sender_name !== m.sender_name || mineOf(g.items[i - 1]))}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-foreground/[0.06] p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder="Message the group…"
            className="max-h-32 flex-1 resize-none rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-3.5 py-2.5 text-sm placeholder:text-foreground/40 focus:border-teal-400/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || sendMut.isPending}
            aria-label="Send"
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)] disabled:opacity-40"
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatRow({ m, mine, showName }: { m: ProgramChatMessage; mine: boolean; showName: boolean }) {
  const isCoach = m.sender_role === 'nutritionist' || m.sender_role === 'owner';
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {showName && (
        <div className={cn('mb-0.5 ml-1 flex items-center gap-1 text-[11px] font-medium', isCoach ? 'text-teal-600 dark:text-teal-300' : 'text-foreground/55')}>
          {isCoach && <Sparkles className="h-2.5 w-2.5" />}
          {m.sender_name}
        </div>
      )}
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm',
          mine
            ? 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white'
            : isCoach
              ? 'bg-teal-500/[0.10] text-foreground'
              : 'bg-foreground/[0.05] text-foreground',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
        <div className={cn('mt-0.5 text-right text-[9px] tabular-nums', mine ? 'text-white/70' : 'text-foreground/40')}>
          {timeOf(m.created_at)}
        </div>
      </div>
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-2 flex items-center justify-center">
      <span className="rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-foreground/45">{label}</span>
    </div>
  );
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function groupByDay(messages: ProgramChatMessage[]): Array<{ key: string; label: string; items: ProgramChatMessage[] }> {
  const out: Array<{ key: string; label: string; items: ProgramChatMessage[] }> = [];
  for (const m of messages) {
    const d = new Date(m.created_at);
    const key = Number.isNaN(d.getTime()) ? 'x' : d.toDateString();
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(m);
    else out.push({ key, label: dayLabel(d), items: [m] });
  }
  return out;
}

function dayLabel(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(); const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
