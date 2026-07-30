import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Eyebrow, Screen, ScreenScroll } from '@/components/ui';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { clientsApi } from '@/lib/clients-api';
import { radius, spacing } from '@/lib/theme';

/**
 * Waiting room for join-link clients until the nutritionist approves (or rejects).
 * Polls profile + join-request so approval advances without a manual refresh.
 */
export default function PendingApproval() {
  const t = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();

  const profileQ = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => clientsApi.myProfile(),
    refetchInterval: 20_000,
  });
  const requestQ = useQuery({
    queryKey: ['me', 'join-request'],
    queryFn: () => clientsApi.myJoinRequest(),
    refetchInterval: 20_000,
  });

  const status = profileQ.data?.status;
  // Rejected join requests usually leave the client `inactive`. Treat either
  // signal as "not approved" so the copy matches reality.
  const rejected = status === 'inactive' || requestQ.data?.status === 'rejected';

  useEffect(() => {
    if (status && status !== 'pending' && status !== 'inactive') {
      // Approved (or already active) — onboarding / tabs handled by root gate.
      router.replace('/');
    }
  }, [status, router]);

  const checking = profileQ.isFetching || requestQ.isFetching;

  return (
    <Screen>
      <ScreenScroll contentContainerStyle={styles.wrap}>
        <Card style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing['2xl'] }}>
          {rejected ? (
            <>
              <View style={[styles.iconChip, { backgroundColor: t.colors.danger + (t.dark ? '2E' : '1A') }]}>
                <Ionicons name="close-circle" size={34} color={t.colors.danger} />
              </View>
              <View style={[styles.statusPill, { backgroundColor: t.colors.danger + (t.dark ? '2E' : '1A') }]}>
                <Ionicons name="alert-circle" size={13} color={t.colors.danger} />
                <AppText variant="caption" tone="danger">
                  Not approved
                </AppText>
              </View>
              <AppText variant="title" style={{ textAlign: 'center' }}>
                Request not approved
              </AppText>
              <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                {requestQ.data?.note?.trim()
                  ? requestQ.data.note
                  : "Your nutritionist didn't approve this request. If you think that's a mistake, reach out to them directly."}
              </AppText>
            </>
          ) : (
            <>
              {/* Calm gradient chip — the warm brand mark while you wait. */}
              <LinearGradient
                colors={t.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconChip}>
                <Ionicons name="hourglass-outline" size={32} color={t.colors.onBrand} />
              </LinearGradient>
              <View style={[styles.statusPill, { backgroundColor: t.colors.warning + (t.dark ? '2E' : '1A') }]}>
                <View style={[styles.dot, { backgroundColor: t.colors.warning }]} />
                <AppText variant="caption" tone="warning">
                  Pending review
                </AppText>
              </View>
              <AppText variant="title" style={{ textAlign: 'center' }}>
                Waiting for approval
              </AppText>
              <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                {"Your request is with your nutritionist. As soon as they approve it, you'll set up your profile — this screen updates on its own."}
              </AppText>
              {requestQ.data?.email ? (
                <View style={[styles.emailRow, { backgroundColor: t.colors.surfaceStrong }]}>
                  <Ionicons name="mail-outline" size={14} color={t.colors.textMuted} />
                  <AppText variant="caption" tone="muted">
                    Requested as {requestQ.data.email}
                  </AppText>
                </View>
              ) : null}
            </>
          )}

          {/* Live status hint — reassures that it's polling on its own. */}
          {!rejected ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {checking ? <ActivityIndicator size="small" color={t.colors.accent} /> : null}
              <Eyebrow>{checking ? 'Checking…' : 'Auto-refreshing'}</Eyebrow>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
            <Pressable
              onPress={() => {
                void profileQ.refetch();
                void requestQ.refetch();
              }}
              style={[styles.secondary, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
              {checking ? (
                <ActivityIndicator size="small" color={t.colors.accent} />
              ) : (
                <Ionicons name="refresh" size={16} color={t.colors.textMuted} />
              )}
              <AppText variant="caption">Check again</AppText>
            </Pressable>
            <Pressable
              onPress={() => void signOut()}
              style={[styles.secondary, { backgroundColor: t.colors.surfaceStrong, borderColor: t.colors.border }]}>
              <Ionicons name="log-out-outline" size={16} color={t.colors.textMuted} />
              <AppText variant="caption">Sign out</AppText>
            </Pressable>
          </View>
        </Card>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing['2xl'] },
  iconChip: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 999 },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
