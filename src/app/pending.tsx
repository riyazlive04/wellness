import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen, ScreenScroll } from '@/components/ui';
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

  return (
    <Screen>
      <ScreenScroll contentContainerStyle={styles.wrap}>
        <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          {rejected ? (
            <>
              <View style={[styles.icon, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                <Ionicons name="close-circle" size={28} color={t.colors.danger} />
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
              <View style={[styles.icon, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Ionicons name="time-outline" size={28} color={t.colors.warning} />
              </View>
              <AppText variant="title" style={{ textAlign: 'center' }}>
                Waiting for approval
              </AppText>
              <AppText variant="muted" tone="muted" style={{ textAlign: 'center' }}>
                {"Your request is with your nutritionist. As soon as they approve it, you'll set up your profile — this screen updates on its own."}
              </AppText>
              {requestQ.data?.email ? (
                <AppText variant="caption" tone="muted">
                  Requested as {requestQ.data.email}
                </AppText>
              ) : null}
            </>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable
              onPress={() => {
                void profileQ.refetch();
                void requestQ.refetch();
              }}
              style={[styles.secondary, { borderColor: t.colors.border }]}>
              {profileQ.isFetching || requestQ.isFetching ? (
                <ActivityIndicator size="small" color={t.colors.accent} />
              ) : (
                <Ionicons name="refresh" size={16} color={t.colors.textMuted} />
              )}
              <AppText variant="caption">Check again</AppText>
            </Pressable>
            <Pressable onPress={() => void signOut()} style={[styles.secondary, { borderColor: t.colors.border }]}>
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
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
