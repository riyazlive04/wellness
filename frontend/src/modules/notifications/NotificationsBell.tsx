import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AppNotification, NotificationsSurface } from './notificationsApi';

/**
 * Notification center bell — unread badge + dropdown feed. Reused by the owner
 * topbar and the client portal; the only difference is which API surface
 * (staff vs client) it's given. Polls the unread count so the badge stays live.
 */
export function NotificationsBell({ surface }: { surface: NotificationsSurface }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const countQ = useQuery({
    queryKey: [surface.key, 'unread'],
    queryFn: () => surface.unreadCount(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const listQ = useQuery({
    queryKey: [surface.key, 'list'],
    queryFn: () => surface.list(30),
    enabled: open,
    retry: 1,
  });

  const listKey = [surface.key, 'list'];
  const unreadKey = [surface.key, 'unread'];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: unreadKey });
    qc.invalidateQueries({ queryKey: listKey });
  };

  // Optimistic: the row greys out and the badge drops the instant you click,
  // instead of waiting on the write + two refetches. Reconciles on settle.
  const readMut = useMutation({
    mutationFn: (id: string) => surface.markRead(id),
    onMutate: async (id: string) => {
      await Promise.all([qc.cancelQueries({ queryKey: listKey }), qc.cancelQueries({ queryKey: unreadKey })]);
      const prevList = qc.getQueryData<AppNotification[]>(listKey);
      const prevCount = qc.getQueryData<number>(unreadKey);
      const wasUnread = !!prevList?.find((n) => n.id === id && !n.read_at);
      const now = new Date().toISOString();
      qc.setQueryData<AppNotification[]>(listKey, (old) =>
        old?.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? now } : n)),
      );
      if (typeof prevCount === 'number' && wasUnread) qc.setQueryData<number>(unreadKey, Math.max(0, prevCount - 1));
      return { prevList, prevCount };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(listKey, ctx.prevList);
      if (ctx?.prevCount !== undefined) qc.setQueryData(unreadKey, ctx.prevCount);
    },
    onSettled: invalidate,
  });
  const readAllMut = useMutation({
    mutationFn: () => surface.markAllRead(),
    onMutate: async () => {
      await Promise.all([qc.cancelQueries({ queryKey: listKey }), qc.cancelQueries({ queryKey: unreadKey })]);
      const prevList = qc.getQueryData<AppNotification[]>(listKey);
      const prevCount = qc.getQueryData<number>(unreadKey);
      const now = new Date().toISOString();
      qc.setQueryData<AppNotification[]>(listKey, (old) => old?.map((n) => (n.read_at ? n : { ...n, read_at: now })));
      qc.setQueryData<number>(unreadKey, 0);
      return { prevList, prevCount };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(listKey, ctx.prevList);
      if (ctx?.prevCount !== undefined) qc.setQueryData(unreadKey, ctx.prevCount);
    },
    onSettled: invalidate,
  });

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = countQ.data ?? 0;
  const items = listQ.data ?? [];

  function openItem(n: AppNotification) {
    if (!n.read_at) readMut.mutate(n.id);
    setOpen(false);
    if (n.url) navigate(n.url);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-1 text-[9px] font-semibold leading-[16px] text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-[340px] overflow-hidden rounded-2xl border border-foreground/[0.08] bg-popover shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => readAllMut.mutate()}
                  disabled={readAllMut.isPending}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline disabled:opacity-50 dark:text-teal-300"
                >
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
            </header>

            <div className="max-h-[60vh] overflow-y-auto">
              {listQ.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/55">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-foreground/55">
                  <Bell className="mx-auto mb-2 h-6 w-6 text-foreground/25" />
                  You're all caught up.
                </div>
              ) : (
                <ul className="divide-y divide-foreground/[0.05]">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]',
                          !n.read_at && 'bg-teal-500/[0.04]',
                        )}
                      >
                        <span className={cn('mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-teal-500')} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">{n.title}</div>
                          {n.body && <div className="mt-0.5 text-xs text-foreground/65">{n.body}</div>}
                          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-foreground/40">{timeAgo(n.created_at)}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.round(sec / 3600)}h ago`;
  if (sec < 604_800) return `${Math.round(sec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
