/**
 * Overview — the nutritionist's home screen ("Green hero" design).
 *
 * A green header with the practice, a greeting and today in one line; four
 * numbers that overlap it; then what needs the nutritionist, today's sessions
 * and recent clients. Every figure is live (analytics, sidebar badges, plate
 * review queue, appointments, plan limits); a count of zero simply drops out.
 */
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListRow, Loading, OWNER_SCROLL_PAD, Pill } from '@/components/owner/ui';
import { AppText, Card } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import { analyticsApi } from '@/lib/owner/api/analytics';
import { ownerClientsApi, type WorkspaceAppointment } from '@/lib/owner/api/clients';
import { plateVisionApi } from '@/lib/owner/api/plate-vision';
import { tenancyApi } from '@/lib/owner/api/tenancy';
import { workspacesApi } from '@/lib/owner/api/workspaces';
import { clockTime, relativeTime, titleCase } from '@/lib/owner/format';
import { radius, spacing } from '@/lib/theme';

const GREEN = ['#1a5c2d', '#2f8f46', '#5aa83f'] as const;

const KIND: Record<WorkspaceAppointment['kind'], string> = {
  consultation: 'Consultation',
  follow_up: 'Follow-up',
  check_in: 'Check-in',
  assessment: 'Assessment',
  group_session: 'Group session',
};
const MODE: Record<WorkspaceAppointment['mode'], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  video: { label: 'Video', icon: 'videocam-outline' },
  phone: { label: 'Phone', icon: 'call-outline' },
  in_person: { label: 'In person', icon: 'location-outline' },
};

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export default function OwnerOverview() {
  const router = useRouter();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { scope, can, hasFeature, badges } = useOwner();
  const [refreshing, setRefreshing] = useState(false);
  // Read once (and on refresh) so "today" and "next" don't change mid-render.
  const [now, setNow] = useState(() => new Date());

  // White status-bar text over the green header, only while this tab is showing.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(t.dark ? 'light' : 'dark');
    }, [t.dark]),
  );

  const canSchedule = hasFeature('appointments') && can('appointments.manage');
  const wsQ = useQuery({ queryKey: ['workspace', 'me'], queryFn: workspacesApi.me });
  const kpiQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk() });
  const limitsQ = useQuery({ queryKey: ['tenancy', 'limits'], queryFn: tenancyApi.getLimits, staleTime: 60_000 });
  const platesQ = useQuery({
    queryKey: ['plates', 'review', 'pending', 50],
    queryFn: () => plateVisionApi.reviewQueue({ status: 'pending', limit: 50 }),
  });
  const todayQ = useQuery({
    queryKey: ['appointments', 'workspace', 'today', dayStart(now).toISOString()],
    queryFn: () => {
      const from = dayStart(now);
      const to = new Date(from.getTime() + 86_400_000);
      return ownerClientsApi.listWorkspaceAppointments(from.toISOString(), to.toISOString());
    },
    enabled: canSchedule,
  });
  const insightsQ = useQuery({
    queryKey: ['analytics', 'insights'],
    queryFn: analyticsApi.insights,
    enabled: hasFeature('ai_assistant') && can('ai.use'),
    staleTime: 10 * 60 * 1000,
  });
  const clientsQ = useQuery({
    queryKey: ['clients', 'recent'],
    queryFn: () => ownerClientsApi.list({ limit: 5 }),
    enabled: can('clients.read'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setNow(new Date());
    await Promise.allSettled([
      wsQ.refetch(),
      kpiQ.refetch(),
      atRiskQ.refetch(),
      limitsQ.refetch(),
      platesQ.refetch(),
      todayQ.refetch(),
      clientsQ.refetch(),
    ]);
    setRefreshing(false);
  }, [wsQ, kpiQ, atRiskQ, limitsQ, platesQ, todayQ, clientsQ]);

  const k = kpiQ.data;
  const sessions = useMemo(
    () =>
      (todayQ.data ?? [])
        .filter((a) => a.status === 'scheduled' || a.status === 'pending')
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [todayQ.data],
  );
  const next = sessions.find((a) => new Date(a.scheduled_at).getTime() + a.duration_minutes * 60_000 > now.getTime());

  // What needs the nutritionist, each only when they can act on it.
  const needs = [
    can('assessments.manage') && { n: badges?.assessments ?? 0, label: 'Forms to review', icon: 'clipboard-outline', color: '#14b8a6', to: '/(owner)/more/assessments' },
    can('food_library.view') && { n: platesQ.data?.length ?? 0, label: 'Meal photos to check', icon: 'camera-outline', color: '#ec4899', to: '/(owner)/more/nutrition?tab=plate-review' },
    can('messaging.use') && { n: badges?.messaging ?? 0, label: 'Unread messages', icon: 'chatbubble-outline', color: '#3b82f6', to: '/(owner)/messaging' },
    can('clients.read') && { n: badges?.clients ?? 0, label: 'Join requests', icon: 'person-add-outline', color: '#8b5cf6', to: '/(owner)/clients/requests' },
    can('clients.read') && { n: atRiskQ.data?.length ?? 0, label: 'Quiet for 10+ days', icon: 'moon-outline', color: '#f59e0b', to: '/(owner)/clients' },
  ].filter((x): x is { n: number; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; to: string } => !!x && x.n > 0);
  const needCount = needs.reduce((s, x) => s + x.n, 0);

  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const meta = user?.user_metadata as { full_name?: string; name?: string } | undefined;
  const firstName = (meta?.full_name || meta?.name || user?.email?.split('@')[0] || '').trim().split(/\s+/)[0];
  const trialDays = scope?.trialEndsAt ? Math.max(0, Math.ceil((new Date(scope.trialEndsAt).getTime() - now.getTime()) / 86_400_000)) : null;

  const used = limitsQ.data?.usage.aiCallsThisMonth;
  const aiLimit = limitsQ.data?.limits.aiCallsPerMonth;
  const activePct = k?.total_clients ? Math.round((k.active_7d / k.total_clients) * 100) : null;

  const headline = [
    canSchedule ? (sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}` : 'no sessions today') : null,
    needCount ? `${needCount} thing${needCount === 1 ? '' : 's'} need${needCount === 1 ? 's' : ''} you` : 'nothing needs you',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.canvas }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: OWNER_SCROLL_PAD }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={insets.top} />}>
        {/* ── Green hero ── */}
        <LinearGradient colors={GREEN} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.heroRow}>
            <View style={styles.logo}>
              <Ionicons name="leaf-outline" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }} numberOfLines={1}>
                {wsQ.data?.name ?? 'Your practice'}
              </AppText>
              <AppText variant="heading" style={{ color: '#fff', fontWeight: '800' }} numberOfLines={1}>
                {greeting}
                {firstName ? `, ${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}` : ''}
              </AppText>
            </View>
            <Pressable onPress={() => router.push('/(owner)/more/notifications')} style={styles.bell} accessibilityLabel="Notifications">
              <Ionicons name="notifications-outline" size={20} color="#fff" />
              {badges?.notifications ? (
                <View style={styles.bellBadge}>
                  <AppText variant="label" style={{ color: '#1a2e05', fontSize: 9 }}>
                    {badges.notifications > 99 ? '99+' : badges.notifications}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          </View>

          <View style={styles.today}>
            <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Today · {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            </AppText>
            <AppText style={styles.headline}>{headline.charAt(0).toUpperCase() + headline.slice(1)}</AppText>
            <View style={styles.chips}>
              {next ? (
                <Pressable onPress={() => router.push(`/(owner)/appointments/${next.id}`)} style={styles.chip}>
                  <AppText variant="label" style={{ color: '#fff' }}>
                    Next {clockTime(next.scheduled_at)} {next.client_name.split(' ')[0]}
                  </AppText>
                </Pressable>
              ) : null}
              {trialDays !== null ? (
                <Pressable onPress={() => router.push('/(owner)/more/billing')} style={[styles.chip, { backgroundColor: '#fcd34d' }]}>
                  <AppText variant="label" style={{ color: '#1c1917' }}>
                    Trial · {trialDays} day{trialDays === 1 ? '' : 's'}
                  </AppText>
                </Pressable>
              ) : scope?.plan ? (
                <View style={styles.chip}>
                  <AppText variant="label" style={{ color: '#fff' }}>
                    {titleCase(scope.plan)}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* ── Four numbers, overlapping the hero ── */}
          <View style={styles.grid}>
            <Stat icon="people-outline" value={k?.total_clients} label="Clients" note={k ? `+${k.new_clients_month} this month` : undefined} onPress={() => router.push('/(owner)/clients')} />
            <Stat icon="pulse-outline" value={k?.active_7d} label="Active (7 days)" note={activePct !== null ? `${activePct}%` : undefined} onPress={() => router.push('/(owner)/clients')} />
            {canSchedule ? (
              <Stat icon="calendar-outline" value={todayQ.data ? sessions.length : undefined} label="Sessions today" note={next ? `next ${clockTime(next.scheduled_at)}` : todayQ.data ? 'none left' : undefined} onPress={() => router.push('/(owner)/appointments')} />
            ) : (
              <Stat icon="chatbubbles-outline" value={k?.messages_7d} label="Messages (7 days)" onPress={() => router.push('/(owner)/messaging')} />
            )}
            <Stat
              icon="sparkles-outline"
              value={used}
              label="AI credits used"
              note={aiLimit != null ? `of ${aiLimit.toLocaleString('en-IN')}` : limitsQ.data ? 'no limit' : undefined}
              onPress={() => router.push('/(owner)/more/settings?tab=ai')}
            />
          </View>

          {/* ── Needs you ── */}
          <AppText variant="heading" style={styles.sectionTitle}>
            Needs you
          </AppText>
          {kpiQ.isLoading || platesQ.isLoading || atRiskQ.isLoading ? (
            <Loading />
          ) : needs.length ? (
            <Card style={styles.listCard}>
              {needs.map((x, i) => (
                <Pressable
                  key={x.label}
                  onPress={() => router.push(x.to as Href)}
                  style={({ pressed }) => [styles.needRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border }, pressed && { opacity: 0.7 }]}>
                  <View style={[styles.needIcon, { backgroundColor: `${x.color}1f` }]}>
                    <Ionicons name={x.icon} size={18} color={x.color} />
                  </View>
                  <AppText variant="body" style={{ flex: 1, fontWeight: '600' }}>
                    {x.label}
                  </AppText>
                  <View style={[styles.count, { backgroundColor: t.colors.surfaceStrong }]}>
                    <AppText variant="label" style={{ fontSize: 12 }}>
                      {x.n > 49 && x.label.startsWith('Meal') ? '50+' : x.n}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={t.colors.textFaint} />
                </Pressable>
              ))}
            </Card>
          ) : (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={[styles.needIcon, { backgroundColor: `${t.colors.success}1f` }]}>
                <Ionicons name="checkmark-done" size={18} color={t.colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="body" style={{ fontWeight: '600' }}>
                  All caught up
                </AppText>
                <AppText variant="caption" tone="muted">
                  No forms, meal photos, messages or join requests waiting.
                </AppText>
              </View>
            </Card>
          )}

          {/* ── Today's sessions ── */}
          {canSchedule && sessions.length ? (
            <>
              <View style={styles.sectionHead}>
                <AppText variant="heading" style={{ flex: 1 }}>
                  Today&apos;s sessions
                </AppText>
                <AppText variant="caption" tone="accent" onPress={() => router.push('/(owner)/appointments')}>
                  Schedule
                </AppText>
              </View>
              <Card style={styles.listCard}>
                {sessions.map((a, i) => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/(owner)/appointments/${a.id}`)}
                    style={[styles.needRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border }]}>
                    <View style={[styles.time, { backgroundColor: '#2f8f461a' }]}>
                      <AppText variant="label" style={{ color: '#23733a', fontSize: 12 }}>
                        {clockTime(a.scheduled_at)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {a.client_name}
                      </AppText>
                      <AppText variant="caption" tone="muted">
                        {KIND[a.kind]} · {MODE[a.mode].label}
                        {a.status === 'pending' ? ' · waiting for you' : ''}
                      </AppText>
                    </View>
                    {a.status === 'pending' ? <Pill label="Request" tone="warning" /> : <Ionicons name={MODE[a.mode].icon} size={18} color={t.colors.textFaint} />}
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}

          {/* ── AI insight ── */}
          {insightsQ.data?.insights ? (
            <Card style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              <Pill label="AI insight" tone="accent" />
              <AppText variant="body">{insightsQ.data.insights}</AppText>
            </Card>
          ) : null}

          {/* ── Recent clients ── */}
          {can('clients.read') && clientsQ.data?.items.length ? (
            <>
              <View style={styles.sectionHead}>
                <AppText variant="heading" style={{ flex: 1 }}>
                  Recent clients
                </AppText>
                <AppText variant="caption" tone="accent" onPress={() => router.push('/(owner)/clients')}>
                  See all
                </AppText>
              </View>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {clientsQ.data.items.map((c) => (
                  <ListRow
                    key={c.id}
                    title={c.display_name || c.name}
                    subtitle={c.program_type ?? c.email}
                    avatarText={c.display_name || c.name}
                    meta={c.last_active_at ? relativeTime(c.last_active_at) : 'New'}
                    onPress={() => router.push(`/(owner)/clients/${c.id}`)}
                  />
                ))}
              </Card>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
  note,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number | undefined;
  label: string;
  note?: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.statWrap, pressed && { opacity: 0.85 }]}>
      {/* Opaque, so the green header behind the top row never shows through. */}
      <Card style={[styles.stat, { backgroundColor: t.dark ? '#141c17' : '#fff' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Ionicons name={icon} size={16} color={t.colors.textFaint} />
          {note ? (
            <AppText variant="caption" style={{ color: t.dark ? '#6ee7a0' : '#2f8f46', fontWeight: '700' }} numberOfLines={1}>
              {note}
            </AppText>
          ) : null}
        </View>
        <AppText style={[styles.statValue, { color: t.colors.text }]}>{value != null ? value.toLocaleString('en-IN') : '–'}</AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {label}
        </AppText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.lg, paddingBottom: 64, gap: spacing.lg },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  bell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fcd34d',
  },
  today: { borderRadius: radius.lg, padding: spacing.lg, gap: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  headline: { color: '#fff', fontSize: 21, lineHeight: 26, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' },
  body: { paddingHorizontal: spacing.lg, marginTop: -44 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statWrap: { width: '47.5%', flexGrow: 1 },
  stat: { padding: spacing.md, gap: 2 },
  statValue: { fontSize: 26, fontWeight: '800', marginTop: 6 },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.sm, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm },
  listCard: { padding: 0, overflow: 'hidden' },
  needRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  needIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 26, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, alignItems: 'center' },
  time: { minWidth: 64, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md },
});
