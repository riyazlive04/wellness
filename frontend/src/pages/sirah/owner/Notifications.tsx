import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, BellRing, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

import { Glass, fadeUp, stagger } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { ChannelCard } from '@/modules/workspace/notifications/components/ChannelCard';
import { EventMatrix } from '@/modules/workspace/notifications/components/EventMatrix';
import { QuietHoursCard } from '@/modules/workspace/notifications/components/QuietHoursCard';
import {
  CHANNELS,
  EVENT_DEFS,
  QUIET_HOURS_DEFAULT,
} from '@/modules/workspace/notifications/data/notificationDefaults';
import { connectionsApi } from '@/modules/workspace/api/connections';
import {
  notificationPreferencesApi,
  type ChannelToggles,
  type NotificationPreferences,
} from '@/modules/workspace/notifications/api/preferences';
import type {
  Channel,
  ChannelKey,
  EventDef,
  QuietHours,
} from '@/modules/workspace/notifications/types';
import { cn } from '@/lib/utils';
import { staffNotifications } from '@/modules/notifications/notificationsApi';

export default function OwnerNotifications() {
  const { t } = useTranslation('ownerNotifications');
  const workspace = readWorkspace();
  const channelLabels = useMemo<Record<ChannelKey, string>>(
    () => ({
      email: t('channels.email'),
      push: t('channels.push'),
      whatsapp: t('channels.whatsapp'),
      inapp: t('channels.inapp'),
    }),
    [t],
  );
  const [channels, setChannels] = useState<Channel[]>(CHANNELS);
  const [events, setEvents] = useState<EventDef[]>(EVENT_DEFS);
  const [quietHours, setQuietHours] = useState<QuietHours>(QUIET_HOURS_DEFAULT);

  // The practice's real recent notifications (the same feed as the bell).
  const recentQ = useQuery({
    queryKey: [staffNotifications.key, 'recent'],
    queryFn: () => staffNotifications.list(8),
    staleTime: 60_000,
  });
  const recent = recentQ.data ?? [];

  // Load saved preferences and overlay them onto the labelled defaults, once.
  const prefsQ = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: notificationPreferencesApi.get,
    staleTime: 60_000,
  });
  /**
   * The practice's real channel connections.
   *
   * WhatsApp used to be hardcoded 'connected' with a placeholder number, so a
   * practice whose link was never finished was told the channel was live - and
   * any event they ticked for WhatsApp silently sent nothing, because the
   * dispatcher refuses without a live token. This is the same list the
   * Integrations screen reads, so the two can no longer disagree.
   */
  const connectionsQ = useQuery({
    queryKey: ['workspace', 'connections'],
    queryFn: connectionsApi.list,
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    const rows = connectionsQ.data;
    if (!rows) return;
    const wa = rows.find((r) => r.channel === 'whatsapp');
    setChannels((cs) =>
      cs.map((c) => {
        if (c.key !== 'whatsapp') return c;
        // On NUSI's own sender WhatsApp works with nothing linked, so the
        // Evolution instance state is irrelevant - reporting a leftover
        // half-finished instance told the practice the channel was broken
        // while it was sending fine, and greyed it out in the events table.
        const onPlatform = (wa?.sender ?? 'platform') === 'platform';
        const live = onPlatform || wa?.status === 'connected';
        return {
          ...c,
          status: live ? 'connected' : wa?.status === 'pending' ? 'pending' : 'unconfigured',
          // The practice's own number when that is what sends; NUSI's sender
          // is ours, and naming it here would invite them to contact it.
          meta: onPlatform
            ? 'Sent from NUSI'
            : live ? wa?.identity ?? undefined : undefined,
          // A channel that cannot send must not sit there switched on.
          enabled: live ? c.enabled : false,
        };
      }),
    );
  }, [connectionsQ.data]);

  const hydrated = useRef(false);
  useEffect(() => {
    const p = prefsQ.data;
    if (!p || hydrated.current) return;
    hydrated.current = true;
    setChannels((cs) =>
      cs.map((c) => {
        if (typeof p.channels?.[c.key] !== 'boolean') return c;
        // A stored "on" must not switch a disconnected channel back on: these
        // two effects race, and the saved preference is older than the truth.
        if (c.status !== 'connected') return { ...c, enabled: false };
        return { ...c, enabled: p.channels[c.key] };
      }),
    );
    setEvents((es) =>
      es.map((e) => {
        const ev = p.events?.[e.key];
        return ev ? { ...e, channels: { ...e.channels, ...ev } } : e;
      }),
    );
    if (p.quietHours) setQuietHours(p.quietHours);
  }, [prefsQ.data]);

  // Debounced persistence — coalesce rapid toggles into a single PUT.
  const saveTimer = useRef<number | undefined>(undefined);
  function persist(nextChannels: Channel[], nextEvents: EventDef[], nextQuiet: QuietHours) {
    if (!hydrated.current) return; // never overwrite the server before we've loaded it
    const payload: NotificationPreferences = {
      channels: Object.fromEntries(nextChannels.map((c) => [c.key, c.enabled])) as ChannelToggles,
      events: Object.fromEntries(nextEvents.map((e) => [e.key, e.channels])) as NotificationPreferences['events'],
      quietHours: nextQuiet,
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      notificationPreferencesApi.update(payload).catch(() => toast.error(t('errors.saveFailed')));
    }, 400);
  }

  const enabledChannelKeys = useMemo(() => {
    return new Set<ChannelKey>(
      channels.filter((c) => c.status === 'connected' && c.enabled).map((c) => c.key),
    );
  }, [channels]);

  function toggleChannel(key: ChannelKey, enabled: boolean) {
    const next = channels.map((c) => (c.key === key ? { ...c, enabled } : c));
    setChannels(next);
    persist(next, events, quietHours);
    toast.success(
      enabled
        ? t('toasts.channelEnabled', { channel: channelLabels[key] })
        : t('toasts.channelPaused', { channel: channelLabels[key] }),
    );
  }

  function connectChannel(key: ChannelKey) {
    const next = channels.map((c) =>
      c.key === key
        ? { ...c, status: 'connected' as const, enabled: true, meta: key === 'push' ? t('channels.pushMeta') : c.meta }
        : c,
    );
    setChannels(next);
    persist(next, events, quietHours);
  }

  function toggleEventChannel(eventKey: EventDef['key'], channel: ChannelKey, nextVal: boolean) {
    const next = events.map((e) =>
      e.key === eventKey ? { ...e, channels: { ...e.channels, [channel]: nextVal } } : e,
    );
    setEvents(next);
    persist(channels, next, quietHours);
  }

  function updateQuietHours(next: QuietHours) {
    setQuietHours(next);
    persist(channels, events, next);
  }

  function sendTestPush() {
    if (typeof Notification === 'undefined') {
      toast.error(t('errors.noNotificationSupport'));
      return;
    }
    if (Notification.permission === 'granted') {
      new Notification(t('testNotification.title'), {
        body: t('testNotification.body'),
      });
      toast.success(t('toasts.testPushSent'));
    } else if (Notification.permission === 'denied') {
      toast.error(t('errors.pushBlocked'));
    } else {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') {
          new Notification(t('testNotification.title'), {
            body: t('testNotification.body'),
          });
          toast.success(t('toasts.testPushSent'));
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
      topbarContext={t('topbar.channelsActive', { active: enabledChannelKeys.size, total: channels.length })}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-[hsl(var(--brand-blue))] text-xs font-bold uppercase tracking-[0.18em]">{t('header.eyebrow')}</span>
              <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">
                {t('header.title')}
              </h1>
              <p className="mt-1.5 text-sm text-foreground/55">
                {t('header.subtitle')}
              </p>
            </div>

            <button
              type="button"
              onClick={sendTestPush}
              className="inline-flex w-fit items-center gap-2 self-start rounded-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-magenta))] px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98] cta-glow"
            >
              <Send className="h-4 w-4" />
              {t('buttons.sendTestPush')}
            </button>
          </motion.div>

          {/* Channels grid */}
          <motion.section variants={fadeUp}>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-500/[0.12] dark:text-teal-300">
                <BellRing className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('sections.channels.eyebrow')}</div>
                <div className="text-sm font-semibold text-foreground">{t('sections.channels.title')}</div>
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
              <div className="mb-3 flex items-center gap-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/[0.12] dark:text-sky-300">
                  <Bell className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">{t('sections.events.eyebrow')}</div>
                  <div className="text-sm font-semibold text-foreground">
                    {t('sections.events.title')}
                  </div>
                </div>
              </div>
              <EventMatrix
                events={events}
                channelLabels={channelLabels}
                enabledChannels={enabledChannelKeys}
                onToggle={toggleEventChannel}
              />
              <div className="mt-2.5 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] px-3.5 py-2.5 text-[11px] leading-relaxed text-foreground/55">
                {t('sections.events.disabledNote')}
              </div>
            </div>

            <div className="space-y-4">
              <QuietHoursCard value={quietHours} onChange={updateQuietHours} />

              {/* Activity log */}
              <Glass className="overflow-hidden rounded-3xl">
                <div className="flex items-center gap-3 border-b border-foreground/[0.06] px-5 py-4">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/[0.12] dark:text-violet-300">
                    <Send className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-blue))]">
                      {t('sections.activity.eyebrow')}
                    </div>
                    <div className="text-sm font-semibold text-foreground">{t('sections.activity.title')}</div>
                  </div>
                </div>
                {recentQ.isLoading ? (
                  <div className="px-5 py-6 text-sm text-foreground/55">Loading…</div>
                ) : recent.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-foreground/55">
                    No notifications yet. They'll appear here as clients log meals, book, and message you.
                  </div>
                ) : (
                  <ul className="divide-y divide-foreground/[0.04]">
                    {recent.map((n) => {
                      const inner = (
                        <>
                          <div className="flex items-start gap-2">
                            {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-[hsl(var(--brand-blue))]" aria-label="Unread" />}
                            <div className="min-w-0 flex-1 text-sm font-medium text-foreground">{n.title}</div>
                            <span className="flex-none text-[10px] font-medium text-foreground/50">{relativeTime(n.created_at)}</span>
                          </div>
                          {n.body && <div className="mt-0.5 text-[11px] text-foreground/55">{n.body}</div>}
                        </>
                      );
                      return (
                        <li key={n.id} className="transition-colors hover:bg-foreground/[0.02]">
                          {n.url ? (
                            <a href={n.url} className="block px-5 py-3.5">{inner}</a>
                          ) : (
                            <div className="px-5 py-3.5">{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
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
  if (sec < 60) return i18n.t('ownerNotifications:time.now');
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
