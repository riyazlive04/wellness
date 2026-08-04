/**
 * Intake queue — self-serve join requests awaiting a decision, plus the
 * pre-approval list (emails cleared to join without review).
 *
 * On the web these are two panels beside the roster; on a phone they get their
 * own screen so approving a batch isn't a scroll-and-hunt exercise.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import {
  ActionButton,
  EmptyState,
  ListRow,
  Loading,
  OwnerPage,
  Section,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ownerClientsApi } from '@/lib/owner/api/clients';
import { initials, relativeTime } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

export default function OwnerJoinRequests() {
  const t = useTheme();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const requestsQ = useQuery({
    queryKey: ['clients', 'join-requests', 'pending'],
    queryFn: () => ownerClientsApi.listJoinRequests('pending'),
  });
  const preapprovalsQ = useQuery({
    queryKey: ['clients', 'preapprovals'],
    queryFn: ownerClientsApi.listPreapprovals,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['clients'] });
    void qc.invalidateQueries({ queryKey: ['owner', 'sidebar-badges'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => ownerClientsApi.approveJoinRequest(id),
    onMutate: (id) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: invalidate,
    onError: (e: Error) => Alert.alert('Could not approve', e.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => ownerClientsApi.rejectJoinRequest(id),
    onMutate: (id) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: invalidate,
    onError: (e: Error) => Alert.alert('Could not reject', e.message),
  });

  const removePre = useMutation({
    mutationFn: (id: string) => ownerClientsApi.removePreapproval(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clients', 'preapprovals'] }),
    onError: (e: Error) => Alert.alert('Could not remove', e.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([requestsQ.refetch(), preapprovalsQ.refetch()]);
    setRefreshing(false);
  };

  const requests = requestsQ.data?.items ?? [];
  const preapprovals = preapprovalsQ.data?.items ?? [];

  return (
    <OwnerPage
      title="Intake"
      subtitle="Join requests and pre-approvals"
      back
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }>
      <Section title={requests.length ? `Awaiting approval · ${requests.length}` : 'Awaiting approval'}>
        {requestsQ.isLoading ? (
          <Loading />
        ) : requestsQ.isError ? (
          <QueryError error={requestsQ.error} onRetry={() => void requestsQ.refetch()} />
        ) : !requests.length ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Nothing waiting"
            body="New signups from your join link will appear here for approval."
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {requests.map((r) => (
              <Card key={r.id} style={{ gap: spacing.md }}>
                <ListRow
                  title={r.name ?? r.email}
                  subtitle={r.name ? r.email : undefined}
                  avatarText={initials(r.name ?? r.email)}
                  meta={relativeTime(r.created_at)}
                />
                {r.note ? (
                  <AppText variant="muted" tone="muted">
                    “{r.note}”
                  </AppText>
                ) : null}
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <ActionButton
                      label="Approve"
                      icon="checkmark"
                      loading={busyId === r.id && approve.isPending}
                      onPress={() => approve.mutate(r.id)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ActionButton
                      label="Reject"
                      icon="close"
                      tone="neutral"
                      loading={busyId === r.id && reject.isPending}
                      onPress={() =>
                        Alert.alert('Reject request?', `${r.email} will not be able to join.`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Reject', style: 'destructive', onPress: () => reject.mutate(r.id) },
                        ])
                      }
                    />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </Section>

      <Section title="Pre-approved emails">
        {preapprovalsQ.isLoading ? (
          <Loading />
        ) : !preapprovals.length ? (
          <EmptyState
            icon="mail-open-outline"
            title="No pre-approvals"
            body="Emails you invite directly skip the approval queue and land here until they sign up."
          />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {preapprovals.map((p) => (
              <ListRow
                key={p.id}
                title={p.name ?? p.email}
                subtitle={p.name ? p.email : p.note ?? undefined}
                icon="mail-outline"
                right={
                  <AppText
                    variant="caption"
                    tone="danger"
                    onPress={() =>
                      Alert.alert('Remove pre-approval?', `${p.email} will need approval if they sign up.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => removePre.mutate(p.id) },
                      ])
                    }>
                    Remove
                  </AppText>
                }
              />
            ))}
          </Card>
        )}
      </Section>
    </OwnerPage>
  );
}
