import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Pressable, RefreshControl, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi, type Appointment } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;
const MODE_ICON: Record<Appointment['mode'], IoniconName> = {
  video: 'videocam-outline',
  phone: 'call-outline',
  in_person: 'location-outline',
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  scheduled: 'success',
  pending: 'warning',
  completed: 'muted',
  cancelled: 'danger',
  declined: 'danger',
  no_show: 'danger',
};

export default function Appointments() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['me', 'appointments'], queryFn: () => clientsApi.myAppointments(), retry: 1 });
  const now = +new Date();
  const all = [...(q.data ?? [])].sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  const upcoming = all.filter((a) => +new Date(a.scheduled_at) >= now && a.status !== 'cancelled');
  const past = all.filter((a) => +new Date(a.scheduled_at) < now || a.status === 'cancelled').reverse();

  return (
    <Screen edges={[]}>
      <ScreenScroll refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.colors.accent} />}>
        {q.isLoading ? (
          <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
            <ActivityIndicator color={t.colors.accent} />
          </View>
        ) : all.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl }}>
            <Ionicons name="calendar-outline" size={26} color={t.colors.textFaint} />
            <AppText variant="muted" tone="muted">No appointments scheduled.</AppText>
          </Card>
        ) : (
          <>
            {upcoming.length ? <Eyebrow>Upcoming</Eyebrow> : null}
            {upcoming.map((a) => <ApptCard key={a.id} a={a} />)}
            {past.length ? <Eyebrow>Past</Eyebrow> : null}
            {past.map((a) => <ApptCard key={a.id} a={a} past />)}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

function ApptCard({ a, past }: { a: Appointment; past?: boolean }) {
  const t = useTheme();
  const d = new Date(a.scheduled_at);
  const canJoin = !past && a.mode === 'video' && a.status === 'scheduled' && a.meeting_url;
  return (
    <Card style={{ gap: spacing.sm, opacity: past ? 0.75 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: t.colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={MODE_ICON[a.mode]} size={20} color={t.colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{titleCase(a.kind)}</AppText>
          <AppText variant="muted" tone="muted">
            {d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </AppText>
        </View>
        <AppText variant="caption" tone={STATUS_TONE[a.status] ?? 'muted'} style={{ textTransform: 'uppercase' }}>
          {a.status}
        </AppText>
      </View>
      {a.location ? <AppText variant="muted" tone="muted">{a.location}</AppText> : null}
      {canJoin ? (
        <Pressable
          onPress={() => a.meeting_url && Linking.openURL(a.meeting_url)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
          <Ionicons name="videocam" size={16} color={t.colors.accent} />
          <AppText variant="muted" tone="accent">Join video call</AppText>
        </Pressable>
      ) : null}
    </Card>
  );
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
