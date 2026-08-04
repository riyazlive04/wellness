/**
 * Notifications — the staff feed plus the delivery preferences the web owner
 * Notifications page manages (channels, per-event matrix, quiet hours).
 *
 * The preferences object round-trips as-is: read it, toggle within it, PUT it
 * back. Nothing here invents a shape the backend doesn't already store.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  Field,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  SegmentedTabs,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  notificationPreferencesApi,
  type NotificationPreferences,
} from '@/lib/owner/api/notification-preferences';
import { staffNotificationsApi } from '@/lib/owner/api/staff-notifications';
import type { ChannelKey, EventKey } from '@/lib/owner/types/notifications';
import { relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Tab = 'feed' | 'settings';

const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: 'inapp', label: 'In app' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

const EVENTS: { key: EventKey; label: string }[] = [
  { key: 'new_client_message', label: 'New client message' },
  { key: 'urgent_client_silent', label: 'Client has gone quiet' },
  { key: 'meal_photo_review', label: 'Meal photo needs review' },
  { key: 'assessment_submitted', label: 'Assessment submitted' },
  { key: 'failed_payment', label: 'Failed payment' },
  { key: 'subscription_renewal', label: 'Subscription renewal' },
  { key: 'trial_ending', label: 'Trial ending' },
  { key: 'team_activity', label: 'Team activity' },
  { key: 'community_mention', label: 'Community mention' },
  { key: 'weekly_report', label: 'Weekly report' },
];

export default function OwnerNotifications() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('feed');
  const [refreshing, setRefreshing] = useState(false);

  const feedQ = useQuery({ queryKey: ['staff-notifications'], queryFn: () => staffNotificationsApi.list(40) });

  const markRead = useMutation({
    mutationFn: (id: string) => staffNotificationsApi.markRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-notifications'] });
      void qc.invalidateQueries({ queryKey: ['owner', 'sidebar-badges'] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => staffNotificationsApi.markAllRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-notifications'] });
      void qc.invalidateQueries({ queryKey: ['owner', 'sidebar-badges'] });
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await feedQ.refetch();
    setRefreshing(false);
  };

  const unread = (feedQ.data ?? []).filter((n) => !n.read_at).length;

  return (
    <OwnerPage
      title="Notifications"
      subtitle={unread ? `${unread} unread` : 'All caught up'}
      back
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }
      contentStyle={{ paddingHorizontal: 0 }}>
      <SegmentedTabs
        options={[
          { key: 'feed', label: 'Feed', badge: unread || undefined },
          { key: 'settings', label: 'Delivery' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'feed' ? (
          feedQ.isLoading ? (
            <Loading />
          ) : feedQ.isError ? (
            <QueryError error={feedQ.error} onRetry={() => void feedQ.refetch()} />
          ) : !feedQ.data?.length ? (
            <EmptyState icon="notifications-off-outline" title="Nothing here" body="Alerts about your practice land here." />
          ) : (
            <>
              {unread ? (
                <ActionButton
                  label="Mark all read"
                  icon="checkmark-done-outline"
                  tone="neutral"
                  loading={markAll.isPending}
                  onPress={() => markAll.mutate()}
                />
              ) : null}
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {feedQ.data.map((n) => (
                  <ListRow
                    key={n.id}
                    title={n.title}
                    subtitle={n.body ?? undefined}
                    icon="notifications-outline"
                    tint={n.read_at ? undefined : t.colors.accent}
                    meta={relativeTime(n.created_at)}
                    onPress={() => {
                      if (!n.read_at) markRead.mutate(n.id);
                      // Feed rows carry web paths; map the ones the app has.
                      const target = mapUrl(n.url);
                      if (target) router.push(target);
                    }}
                  />
                ))}
              </Card>
            </>
          )
        ) : (
          <PreferencesPanel />
        )}
      </View>
    </OwnerPage>
  );
}

/**
 * Notification rows store web paths (`/clients/abc`). Translate the ones that
 * have a mobile equivalent and ignore the rest rather than pushing a route
 * that doesn't exist.
 */
function mapUrl(url: string | null): Href | null {
  if (!url) return null;
  const m = /^\/clients\/([^/?#]+)/.exec(url);
  if (m) return `/(owner)/clients/${m[1]}`;
  if (url.startsWith('/messaging')) return '/(owner)/messaging';
  if (url.startsWith('/appointments')) return '/(owner)/appointments';
  if (url.startsWith('/billing')) return '/(owner)/more/billing';
  return null;
}

function PreferencesPanel() {
  const qc = useQueryClient();
  const prefsQ = useQuery({ queryKey: ['notification-preferences'], queryFn: notificationPreferencesApi.get });

  // Unsaved edits sit over the server copy rather than being copied into state
  // by an effect — no hydration race, and nothing for the compiler to flag.
  const [edits, setEdits] = useState<NotificationPreferences | null>(null);
  const prefs = edits ?? prefsQ.data ?? null;
  const dirty = edits !== null;

  const save = useMutation({
    mutationFn: () => notificationPreferencesApi.update(edits!),
    onSuccess: () => {
      setEdits(null);
      void qc.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (e: Error) => Alert.alert('Could not save', e.message),
  });

  if (prefsQ.isLoading) return <Loading />;
  if (prefsQ.isError) return <QueryError error={prefsQ.error} onRetry={() => void prefsQ.refetch()} />;
  if (!prefs) return <Loading />;

  const toggleChannel = (key: ChannelKey) =>
    setEdits({ ...prefs, channels: { ...prefs.channels, [key]: !prefs.channels[key] } });

  const toggleEventChannel = (event: EventKey, channel: ChannelKey) => {
    const current = prefs.events[event] ?? prefs.channels;
    setEdits({
      ...prefs,
      events: { ...prefs.events, [event]: { ...current, [channel]: !current[channel] } },
    });
  };

  const setQuiet = (patch: Partial<NotificationPreferences['quietHours']>) =>
    setEdits({ ...prefs, quietHours: { ...prefs.quietHours, ...patch } });

  return (
    <>
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Channels</AppText>
        <AppText variant="muted" tone="muted">
          Turn a channel off here and it stops for every event.
        </AppText>
        {CHANNELS.map((c) => (
          <ListRow
            key={c.key}
            title={c.label}
            onPress={() => toggleChannel(c.key)}
            right={
              <Pill label={prefs.channels[c.key] ? 'On' : 'Off'} tone={prefs.channels[c.key] ? 'success' : 'neutral'} />
            }
          />
        ))}
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Per event</AppText>
        <AppText variant="muted" tone="muted">
          Tap a channel chip to toggle it for that event.
        </AppText>
        {EVENTS.map((e) => {
          const row = prefs.events[e.key] ?? prefs.channels;
          return (
            <View key={e.key} style={{ gap: spacing.xs, paddingVertical: spacing.xs }}>
              <AppText variant="body">{e.label}</AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                {CHANNELS.map((c) => {
                  const on = !!row[c.key] && !!prefs.channels[c.key];
                  return (
                    <View key={c.key}>
                      <AppText
                        variant="caption"
                        tone={on ? 'accent' : 'faint'}
                        onPress={() => toggleEventChannel(e.key, c.key)}
                        style={{ paddingVertical: 4, paddingHorizontal: 8 }}>
                        {on ? '● ' : '○ '}
                        {c.label}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">Quiet hours</AppText>
        <SegmentedTabs
          options={[
            { key: 'off', label: 'Off' },
            { key: 'on', label: 'On' },
          ]}
          value={prefs.quietHours.enabled ? 'on' : 'off'}
          onChange={(v) => setQuiet({ enabled: v === 'on' })}
        />
        {prefs.quietHours.enabled ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Field
                label="From (hour)"
                value={String(prefs.quietHours.startHour)}
                onChangeText={(v) => setQuiet({ startHour: clampHour(v) })}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="To (hour)"
                value={String(prefs.quietHours.endHour)}
                onChangeText={(v) => setQuiet({ endHour: clampHour(v) })}
                keyboardType="number-pad"
              />
            </View>
          </View>
        ) : null}
        <AppText variant="caption" tone="faint">
          {`Times are in your device timezone (UTC${(prefs.tzOffsetMinutes ?? 0) >= 0 ? '+' : ''}${Math.round((prefs.tzOffsetMinutes ?? 0) / 60)}).`}
        </AppText>
      </Card>

      <ActionButton
        label="Save preferences"
        icon="save-outline"
        disabled={!dirty}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </>
  );
}

function clampHour(v: string): number {
  const n = Number(v.replace(/\D/g, ''));
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(23, n));
}
