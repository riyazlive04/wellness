import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, Utensils, Droplet, Calendar, Sparkles, BellRing, Loader2, BellOff, Inbox } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import {
  clientNotifications,
  clientNotificationPrefsApi,
  type AppNotification,
} from '@/modules/notifications/notificationsApi';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { cn } from '@/lib/utils';

const PREFS = [
  { key: 'meal',      icon: Utensils, label: 'Meal reminders',         desc: 'Nudge me at meal times'      },
  { key: 'water',     icon: Droplet,  label: 'Water reminders',        desc: 'Hydration ping every 2 hours' },
  { key: 'appt',      icon: Calendar, label: 'Appointment reminders',  desc: '24 hours and 1 hour before'   },
  { key: 'program',   icon: BellRing, label: 'Program reminders',      desc: 'Daily task summary at 8am'    },
  { key: 'ai_nudge',  icon: Sparkles, label: 'AI nudges',              desc: 'Smart suggestions from NUSI' },
];

export default function ClientNotifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  // The real notification feed — appointments, messages, programs, reminders.
  const feedQ = useQuery({
    queryKey: [clientNotifications.key, 'list'],
    queryFn: () => clientNotifications.list(30),
    retry: 1,
  });
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    meal: true, water: true, appt: true, program: true, ai_nudge: true,
  });

  // Load saved category toggles and overlay them onto the defaults, once.
  const prefsQ = useQuery({
    queryKey: ['client-notification-preferences'],
    queryFn: clientNotificationPrefsApi.get,
    retry: 1,
    staleTime: 60_000,
  });
  const hydrated = useRef(false);
  useEffect(() => {
    if (prefsQ.data && !hydrated.current) {
      hydrated.current = true;
      setPrefs((p) => ({ ...p, ...prefsQ.data }));
    }
  }, [prefsQ.data]);

  const savePrefs = useMutation({
    mutationFn: (next: Record<string, boolean>) => clientNotificationPrefsApi.update(next),
    onSuccess: () => toast.success('Saved'),
    onError: () => toast.error("Couldn't save — try again."),
  });

  const items = feedQ.data ?? [];
  const push = usePushSubscription();

  const markRead = useMutation({
    mutationFn: (id: string) => clientNotifications.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [clientNotifications.key, 'list'] });
      qc.invalidateQueries({ queryKey: [clientNotifications.key, 'unread'] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => clientNotifications.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [clientNotifications.key, 'list'] });
      qc.invalidateQueries({ queryKey: [clientNotifications.key, 'unread'] });
    },
  });

  const unread = items.filter((n) => !n.read_at).length;

  function openItem(n: AppNotification) {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.url) navigate(n.url);
  }

  // Split history into Today / Earlier so the wide card reads like a feed.
  const { today, earlier } = useMemo(() => {
    const t: AppNotification[] = [];
    const e: AppNotification[] = [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    for (const n of items) {
      const when = new Date(n.created_at).getTime();
      if (!Number.isNaN(when) && when >= startOfDay.getTime()) t.push(n);
      else e.push(n);
    }
    return { today: t, earlier: e };
  }, [items]);

  const activePrefs = PREFS.filter((p) => prefs[p.key]).length;

  function toggle(key: string) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    savePrefs.mutate(next);
  }

  async function togglePush() {
    // Snapshot the current state up front so we know which branch we took —
    // push.status is a stale closure value after the await otherwise.
    const wasSubscribed = push.status === 'subscribed';
    try {
      if (wasSubscribed) {
        await push.unsubscribe();
        toast.success('Push notifications turned off.');
      } else {
        await push.subscribe();
        // Granted vs denied is reflected on Notification.permission directly —
        // safer than re-reading push.status which won't have updated yet.
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          toast.success('You\'re subscribed. NUSI will ping you for important nudges.');
        } else {
          toast.message('Browser declined permission. Enable in site settings to allow notifications.');
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update push subscription.');
    }
  }

  return (
    <ClientLayout firstName={profileQ.data?.name?.split(' ')[0]}>
      <div className="mx-auto w-full max-w-5xl space-y-7 px-5 py-8 md:px-8 md:py-10">
        <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate" className="space-y-7">
          {/* ── Header ───────────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center gap-2 text-teal-600 dark:text-teal-300">
              <Bell className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Care · Notifications</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">When NUSI talks to you.</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">Choose what you want pinged, then catch up on everything NUSI has sent. Quiet by default.</p>
          </motion.div>

          {/* ── Stat strip ───────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={Inbox} label="History" value={String(items.length)} tint="text-blue-600 dark:text-blue-300" />
            <StatTile icon={Sparkles} label="Today" value={String(today.length)} tint="text-teal-600 dark:text-teal-300" />
            <StatTile icon={BellRing} label="Unread" value={String(unread)} tint="text-emerald-600 dark:text-emerald-300" />
            <StatTile
              icon={push.status === 'subscribed' ? BellRing : BellOff}
              label="Push"
              value={push.status === 'subscribed' ? 'On' : 'Off'}
              tint={push.status === 'subscribed' ? 'text-emerald-600 dark:text-emerald-300' : 'text-foreground/45'}
            />
          </motion.div>

          {/* ── Browser push — the "talk to me on lock screen" gate ──── */}
          <motion.div variants={fadeUp}>
            <AIGlow intensity="soft" animated>
              <Glass variant="heavy" className="p-5 md:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/15">
                    {push.status === 'subscribed'
                      ? <BellRing className="h-5 w-5 text-teal-700 dark:text-teal-200" />
                      : <BellOff className="h-5 w-5 text-foreground/60" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                      Browser push
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {labelForPushStatus(push.status)}
                    </div>
                    <p className="mt-1 max-w-xl text-xs text-foreground/65">
                      {push.status === 'denied'
                        ? 'You blocked notifications earlier. Open your browser’s site settings to allow.'
                        : push.status === 'unsupported'
                          ? 'This browser doesn’t support push notifications. Try Chrome, Edge, or Firefox.'
                          : 'Get nudges on your device even when NUSI isn’t open. Tap the button to manage.'}
                    </p>
                  </div>
                  {(push.status === 'idle' || push.status === 'subscribed') && (
                    <button
                      type="button"
                      onClick={togglePush}
                      disabled={push.busy}
                      className={cn(
                        'inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-medium transition-all',
                        push.status === 'subscribed'
                          ? 'border border-foreground/10 hover:bg-foreground/[0.05]'
                          : 'bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] text-white shadow-[0_8px_24px_-8px_rgba(14,154,168,0.55)]',
                        'disabled:opacity-50',
                      )}
                    >
                      {push.busy && <Loader2 className="h-3 w-3 animate-spin" />}
                      {push.status === 'subscribed' ? 'Turn off' : 'Enable push'}
                    </button>
                  )}
                </div>
              </Glass>
            </AIGlow>
          </motion.div>

          {/* ── Body: history feed + preferences aside ───────────────── */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* History */}
            <motion.div variants={fadeUp} className="lg:col-span-2">
              <Glass className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                  <span className="text-sm font-medium">History</span>
                  {unread > 0 ? (
                    <button
                      type="button"
                      onClick={() => markAll.mutate()}
                      disabled={markAll.isPending}
                      className="text-[11px] font-medium text-teal-700 hover:underline disabled:opacity-50 dark:text-teal-300"
                    >
                      Mark all read
                    </button>
                  ) : (
                    <span className="text-[11px] text-foreground/45">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                  )}
                </div>

                {feedQ.isLoading ? (
                  <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-16 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-foreground/[0.04]">
                      <Bell className="h-6 w-6 text-foreground/30" />
                    </div>
                    <div className="mt-3 text-sm text-foreground/70">No notifications yet</div>
                    <div className="mt-1 max-w-sm text-xs text-foreground/50">When NUSI sends you a reminder, message, or appointment update, it will show up here.</div>
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    {today.length > 0 && (
                      <NotificationGroup title="Today" items={today} onOpen={openItem} />
                    )}
                    {earlier.length > 0 && (
                      <NotificationGroup title="Earlier" items={earlier} onOpen={openItem} className={today.length > 0 ? 'mt-6' : ''} />
                    )}
                  </div>
                )}
              </Glass>
            </motion.div>

            {/* Side: preferences */}
            <motion.div variants={fadeUp} className="space-y-5">
              <Glass className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                  <span className="text-sm font-medium">Preferences</span>
                  <span className="text-[11px] text-foreground/45">{activePrefs} on</span>
                </div>
                <div className="divide-y divide-foreground/[0.05]">
                  {PREFS.map((p) => (
                    <PrefRow
                      key={p.key}
                      icon={<p.icon className="h-4 w-4 text-foreground/65" />}
                      label={p.label}
                      desc={p.desc}
                      on={prefs[p.key]}
                      onToggle={() => toggle(p.key)}
                    />
                  ))}
                </div>
              </Glass>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </ClientLayout>
  );
}

function StatTile({ icon: Icon, label, value, tint }: { icon: typeof Bell; label: string; value: string; tint: string }) {
  return (
    <Glass className="p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', tint)} strokeWidth={1.8} />
        <span className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </Glass>
  );
}

function NotificationGroup({
  title, items, onOpen, className,
}: {
  title: string;
  items: AppNotification[];
  onOpen: (n: AppNotification) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">{title}</div>
      <div className="space-y-2">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onOpen(n)}
            className={cn(
              'flex w-full items-start gap-3 rounded-2xl border border-foreground/[0.06] p-4 text-left transition-colors hover:bg-foreground/[0.04]',
              n.read_at ? 'bg-foreground/[0.015]' : 'bg-teal-500/[0.05]',
            )}
          >
            <div className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-foreground/[0.05]">
              <Bell className="h-3.5 w-3.5 text-foreground/65" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{n.title}</p>
              {n.body && <p className="mt-0.5 text-sm leading-relaxed text-foreground/65">{n.body}</p>}
              <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                {new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            {!n.read_at && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-teal-500" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function labelForPushStatus(status: ReturnType<typeof usePushSubscription>['status']): string {
  switch (status) {
    case 'subscribed':  return 'You\'re subscribed';
    case 'idle':        return 'Push notifications are off';
    case 'denied':      return 'Push is blocked';
    case 'unsupported': return 'Push not supported on this browser';
    case 'loading':     return 'Checking permission…';
  }
}

function PrefRow({ icon, label, desc, on, onToggle }: { icon: ReactNode; label: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-foreground/[0.04]">{icon}</div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-foreground/55">{desc}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full px-0.5 transition-colors',
          on ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-foreground/15',
        )}
      >
        <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200', on ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}
