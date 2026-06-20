import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, Utensils, Droplet, Calendar, Sparkles, BellRing, Loader2, BellOff, Inbox } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { AIGlow, Glass, fadeUp, stagger } from '@/design-system';
import { ClientLayout } from '@/modules/client/ClientLayout';
import { clientsApi } from '@/modules/workspace/api/clients';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { cn } from '@/lib/utils';

const PREFS = [
  { key: 'meal',      icon: Utensils, label: 'Meal reminders',         desc: 'Nudge me at meal times'      },
  { key: 'water',     icon: Droplet,  label: 'Water reminders',        desc: 'Hydration ping every 2 hours' },
  { key: 'appt',      icon: Calendar, label: 'Appointment reminders',  desc: '24 hours and 1 hour before'   },
  { key: 'program',   icon: BellRing, label: 'Program reminders',      desc: 'Daily task summary at 8am'    },
  { key: 'ai_nudge',  icon: Sparkles, label: 'AI nudges',              desc: 'Smart suggestions from SIRAH' },
];

export default function ClientNotifications() {
  const profileQ = useQuery({ queryKey: ['me', 'profile'], queryFn: () => clientsApi.myProfile(), retry: 1 });
  const messagesQ = useQuery({
    queryKey: ['me', 'messages'],
    queryFn: () => clientsApi.myMessages(30),
    retry: 1,
  });
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    meal: true, water: true, appt: true, program: true, ai_nudge: true,
  });

  const messages = messagesQ.data ?? [];
  const push = usePushSubscription();

  // Split history into Today / Earlier so the wide card reads like a feed.
  const { today, earlier } = useMemo(() => {
    const t: typeof messages = [];
    const e: typeof messages = [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    for (const m of messages) {
      const when = new Date(m.created_at).getTime();
      if (!Number.isNaN(when) && when >= startOfDay.getTime()) t.push(m);
      else e.push(m);
    }
    return { today: t, earlier: e };
  }, [messages]);

  const activePrefs = PREFS.filter((p) => prefs[p.key]).length;

  function toggle(key: string) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    toast.success('Saved');
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
          toast.success('You\'re subscribed. SIRAH will ping you for important nudges.');
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
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <Bell className="h-4 w-4" /><span className="text-xs uppercase tracking-[0.18em]">Care · Notifications</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">When SIRAH talks to you.</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-foreground/60">Choose what you want pinged, then catch up on everything SIRAH has sent. Quiet by default.</p>
          </motion.div>

          {/* ── Stat strip ───────────────────────────────────────────── */}
          <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={Inbox} label="History" value={String(messages.length)} tint="text-blue-600 dark:text-blue-300" />
            <StatTile icon={Sparkles} label="Today" value={String(today.length)} tint="text-violet-600 dark:text-violet-300" />
            <StatTile icon={BellRing} label="Active alerts" value={`${activePrefs}/${PREFS.length}`} tint="text-emerald-600 dark:text-emerald-300" />
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
                  <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-fuchsia-500/15">
                    {push.status === 'subscribed'
                      ? <BellRing className="h-5 w-5 text-violet-700 dark:text-violet-200" />
                      : <BellOff className="h-5 w-5 text-foreground/60" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
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
                          : 'Get nudges on your device even when SIRAH isn’t open. Tap the button to manage.'}
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
                          : 'bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.55)]',
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
                  <span className="text-[11px] text-foreground/45">{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
                </div>

                {messagesQ.isLoading ? (
                  <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-foreground/40" /></div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-16 text-center">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-foreground/[0.04]">
                      <Bell className="h-6 w-6 text-foreground/30" />
                    </div>
                    <div className="mt-3 text-sm text-foreground/70">No notifications yet</div>
                    <div className="mt-1 max-w-sm text-xs text-foreground/50">When SIRAH sends you a reminder or nudge, it will show up here. Turn on what you care about in Preferences.</div>
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    {today.length > 0 && (
                      <MessageGroup title="Today" messages={today} />
                    )}
                    {earlier.length > 0 && (
                      <MessageGroup title="Earlier" messages={earlier} className={today.length > 0 ? 'mt-6' : ''} />
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

function MessageGroup({
  title, messages, className,
}: {
  title: string;
  messages: Array<{ id: string; content: string; sender_type?: string; created_at: string }>;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">{title}</div>
      <div className="space-y-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className="flex items-start gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.015] p-4 transition-colors hover:bg-foreground/[0.04]"
          >
            <div className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-foreground/[0.05]">
              {m.sender_type === 'system'
                ? <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" />
                : <Bell className="h-3.5 w-3.5 text-foreground/65" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed">{m.content}</p>
              <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                {new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
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
          'relative h-6 w-10 flex-shrink-0 rounded-full transition-colors',
          on ? 'bg-gradient-to-r from-blue-500 to-fuchsia-500' : 'bg-foreground/15',
        )}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
