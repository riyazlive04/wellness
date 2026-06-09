import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, Utensils, Droplet, Calendar, Sparkles, BellRing, Loader2, BellOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
      <motion.div variants={stagger(0.06, 0.05)} initial="initial" animate="animate"
        className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <motion.div variants={fadeUp}>
          <span className="text-[11px] uppercase tracking-[0.20em] text-foreground/55">Care · Notifications</span>
          <h1 className="mt-1 text-3xl font-semibold md:text-4xl">When SIRAH talks to you.</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/65">Choose what you want pinged. Quiet by default.</p>
        </motion.div>

        {/* Browser push — the "make SIRAH talk to me on lock screen" gate */}
        <motion.div variants={fadeUp} className="mt-6">
          <AIGlow intensity="soft" animated>
            <Glass variant="heavy" className="p-5">
              <div className="flex items-start gap-4">
                <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-fuchsia-500/15">
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
                  <p className="mt-1 text-xs text-foreground/65">
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
                      'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-all',
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

        <motion.div variants={fadeUp} className="mt-6">
          <h2 className="mb-3 text-base font-semibold">Preferences</h2>
          <Glass className="divide-y divide-foreground/[0.05]">
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
          </Glass>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-6">
          <h2 className="mb-3 text-base font-semibold">History</h2>
          {messages.length === 0 ? (
            <Glass className="flex flex-col items-center gap-3 p-8 text-center">
              <Bell className="h-6 w-6 text-foreground/35" />
              <div className="text-sm text-foreground/55">No notifications yet.</div>
            </Glass>
          ) : (
            <Glass className="divide-y divide-foreground/[0.05]">
              {messages.map((m) => (
                <div key={m.id} className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-foreground/[0.05]">
                    {m.sender_type === 'system'
                      ? <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                      : <Bell className="h-3.5 w-3.5 text-foreground/65" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{m.content}</p>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                      {new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </Glass>
          )}
        </motion.div>
      </motion.div>
    </ClientLayout>
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
          'relative h-6 w-10 rounded-full transition-colors',
          on ? 'bg-gradient-to-r from-blue-500 to-fuchsia-500' : 'bg-foreground/15',
        )}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}