import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Mail, MessageCircle, BellRing, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { ChannelCard } from '@/modules/workspace/notifications/components/ChannelCard';
import { EventMatrix } from '@/modules/workspace/notifications/components/EventMatrix';
import { QuietHoursCard } from '@/modules/workspace/notifications/components/QuietHoursCard';
import {
  ACTIVITY,
  CHANNELS,
  EVENT_DEFS,
  QUIET_HOURS_DEFAULT,
} from '@/modules/workspace/notifications/data/mockNotifications';
import type {
  Channel,
  ChannelKey,
  EventDef,
  QuietHours,
} from '@/modules/workspace/notifications/types';
import { cn } from '@/lib/utils';

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  email:    'Email',
  push:     'Push',
  whatsapp: 'WhatsApp',
  inapp:    'In-app',
};

const CHANNEL_ICON: Record<ChannelKey, React.ComponentType<{ className?: string }>> = {
  email:    Mail,
  push:     BellRing,
  whatsapp: MessageCircle,
  inapp:    Bell,
};

export default function OwnerNotifications() {
  const workspace = readWorkspace();
  const [channels, setChannels] = useState<Channel[]>(CHANNELS);
  const [events, setEvents] = useState<EventDef[]>(EVENT_DEFS);
  const [quietHours, setQuietHours] = useState<QuietHours>(QUIET_HOURS_DEFAULT);

  const enabledChannelKeys = useMemo(() => {
    return new Set<ChannelKey>(
      channels.filter((c) => c.status === 'connected' && c.enabled).map((c) => c.key),
    );
  }, [channels]);

  function toggleChannel(key: ChannelKey, enabled: boolean) {
    setChannels((cs) => cs.map((c) => (c.key === key ? { ...c, enabled } : c)));
    toast.success(`${CHANNEL_LABELS[key]} ${enabled ? 'enabled' : 'paused'}.`);
  }

  function connectChannel(key: ChannelKey) {
    setChannels((cs) =>
      cs.map((c) =>
        c.key === key
          ? {
              ...c,
              status: 'connected',
              enabled: true,
              meta: key === 'push' ? 'This browser' : c.meta,
            }
          : c,
      ),
    );
  }

  function toggleEventChannel(eventKey: EventDef['key'], channel: ChannelKey, next: boolean) {
    setEvents((es) =>
      es.map((e) =>
        e.key === eventKey
          ? { ...e, channels: { ...e.channels, [channel]: next } }
          : e,
      ),
    );
  }

  function sendTestPush() {
    if (typeof Notification === 'undefined') {
      toast.error('This browser does not support notifications.');
      return;
    }
    if (Notification.permission === 'granted') {
      new Notification('SIRAH LIFE · test', {
        body: 'Looks good — your browser is wired up correctly.',
      });
      toast.success('Test push sent.');
    } else if (Notification.permission === 'denied') {
      toast.error('Push permission is blocked. Enable it in your browser settings.');
    } else {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') {
          new Notification('SIRAH LIFE · test', {
            body: 'Looks good — your browser is wired up correctly.',
          });
          toast.success('Test push sent.');
          connectChannel('push');
        }
      });
    }
  }

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      trialDaysLeft={28}
      topbarContext={`${enabledChannelKeys.size} of ${channels.length} channels active`}
      onSignOut={() => toast('Sign-out wiring lands with the auth context refactor.')}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs uppercase tracking-[0.18em] text-foreground/55">Notifications</span>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
                Decide what reaches you, and how
              </h1>
              <p className="mt-1 text-sm text-foreground/55">
                Channels, events, and quiet hours — tuned to your workflow.
              </p>
            </div>

            <button
              type="button"
              onClick={sendTestPush}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-2 text-sm text-foreground/85 transition-colors hover:bg-foreground/[0.06]"
            >
              <Send className="h-3.5 w-3.5" />
              Send test push
            </button>
          </motion.div>

          {/* Channels grid */}
          <motion.section variants={fadeUp}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Channels</div>
                <div className="text-sm font-medium text-foreground">How SIRAH reaches you</div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {channels.map((c) => (
                <ChannelCard
                  key={c.key}
                  channel={c}
                  onToggle={(v) => toggleChannel(c.key, v)}
                  onConnect={() => connectChannel(c.key)}
                />
              ))}
            </div>
          </motion.section>

          {/* Events matrix + quiet hours */}
          <motion.section variants={fadeUp} className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">Events</div>
                <div className="text-sm font-medium text-foreground">
                  Pick the channels for each event type
                </div>
              </div>
              <EventMatrix
                events={events}
                channelLabels={CHANNEL_LABELS}
                enabledChannels={enabledChannelKeys}
                onToggle={toggleEventChannel}
              />
              <div className="mt-2 text-[11px] text-foreground/55">
                Greyed-out columns belong to channels you've disabled above. Re-enable them to pick
                events from those channels.
              </div>
            </div>

            <div className="space-y-4">
              <QuietHoursCard value={quietHours} onChange={setQuietHours} />

              {/* Activity log */}
              <Glass className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/55">
                      Recent activity
                    </div>
                    <div className="text-sm font-medium text-foreground">What's been sent</div>
                  </div>
                </div>
                <ul className="divide-y divide-foreground/[0.04]">
                  {ACTIVITY.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <div className="text-sm text-foreground">{a.title}</div>
                      <div className="mt-0.5 text-[11px] text-foreground/55">{a.detail}</div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          {a.channels.map((c) => {
                            const Icon = CHANNEL_ICON[c];
                            return (
                              <span
                                key={c}
                                className="inline-flex items-center gap-1 rounded-full border border-foreground/[0.06] bg-foreground/[0.03] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-foreground/65"
                                title={CHANNEL_LABELS[c]}
                              >
                                <Icon className={cn('h-2.5 w-2.5')} />
                                {CHANNEL_LABELS[c]}
                              </span>
                            );
                          })}
                        </div>
                        <span className="text-foreground/55">{relativeTime(a.sentAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Glass>
            </div>
          </motion.section>
        </motion.div>
      </div>
    </OwnerLayout>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = 'Your Practice';
  const ownerName = 'You';
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
