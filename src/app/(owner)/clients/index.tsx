/**
 * Clients — the practice roster.
 *
 * Ports the web Clients page (pages/sirah/owner/Clients.tsx): searchable,
 * status-filtered list backed by ownerClientsApi.list, plus the two intake
 * queues that live alongside it (self-serve join requests and pre-approvals)
 * and the shareable join link.
 *
 * At-risk clients are merged in as a badge on the row rather than a separate
 * panel — on a phone the roster IS the page, so the signal belongs on the row.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, Share, View } from 'react-native';

import {
  ActionButton,
  Can,
  EmptyState,
  Field,
  IconButton,
  ListRow,
  Loading,
  OwnerHeader,
  Pill,
  SearchField,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card, Screen } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import { analyticsApi } from '@/lib/owner/api/analytics';
import { ownerClientsApi, type ClientListItem } from '@/lib/owner/api/clients';
import { initials, relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type StatusKey = 'all' | 'active' | 'paused' | 'archived' | 'completed';

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

const PAGE = 30;

export default function OwnerClients() {
  const router = useRouter();
  const t = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ new?: string }>();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [refreshing, setRefreshing] = useState(false);
  const debounced = useDebouncedValue(query, 300);

  // Overview's "Add a client" deep-links here with ?new=1. The sheet is open
  // when the param says so and the user hasn't dismissed it — derived, so no
  // effect is needed to seed the state.
  const [intakeDismissed, setIntakeDismissed] = useState(false);
  const [intakeRequested, setIntakeRequested] = useState(false);
  const intakeOpen = intakeRequested || (params.new === '1' && !intakeDismissed);
  const setIntakeOpen = (open: boolean) => {
    setIntakeRequested(open);
    if (!open) setIntakeDismissed(true);
  };

  const listQ = useQuery({
    queryKey: ['clients', 'list', debounced, status],
    queryFn: () =>
      ownerClientsApi.list({
        q: debounced || undefined,
        status: status === 'all' ? undefined : status,
        limit: PAGE,
      }),
  });

  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk() });
  const requestsQ = useQuery({
    queryKey: ['clients', 'join-requests', 'pending'],
    queryFn: () => ownerClientsApi.listJoinRequests('pending'),
  });

  const atRiskIds = useMemo(() => new Set((atRiskQ.data ?? []).map((c) => c.id)), [atRiskQ.data]);
  const pendingRequests = requestsQ.data?.items ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([listQ.refetch(), atRiskQ.refetch(), requestsQ.refetch()]);
    setRefreshing(false);
  };

  const items = listQ.data?.items ?? [];

  return (
    <Screen>
      <OwnerHeader
        title="Clients"
        subtitle={listQ.data ? `${listQ.data.total} total` : undefined}
        actions={
          <Can permission="clients.read">
            <IconButton
              icon="person-add-outline"
              tone="accent"
              accessibilityLabel="Add clients"
              onPress={() => setIntakeOpen(true)}
            />
          </Can>
        }
      />

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search name or email" />
      </View>
      <View style={{ paddingBottom: spacing.sm }}>
        <SegmentedTabs options={STATUS_TABS} value={status} onChange={setStatus} />
      </View>

      {listQ.isLoading ? (
        <Loading label="Loading your roster" />
      ) : listQ.isError ? (
        <View style={{ padding: spacing.lg }}>
          <QueryError error={listQ.error} onRetry={() => void listQ.refetch()} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
          }
          contentContainerStyle={{ paddingBottom: spacing['3xl'] * 2 }}
          ListHeaderComponent={
            pendingRequests.length ? (
              <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
                <PendingRequests
                  count={pendingRequests.length}
                  onOpen={() => router.push('/(owner)/clients/requests')}
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ padding: spacing.lg }}>
              <EmptyState
                icon="people-outline"
                title={debounced || status !== 'all' ? 'No matches' : 'No clients yet'}
                body={
                  debounced || status !== 'all'
                    ? 'Try a different search or filter.'
                    : 'Share your join link and the first signups land here.'
                }
                action={
                  debounced || status !== 'all' ? undefined : (
                    <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
                      <ActionButton label="Invite clients" icon="link-outline" onPress={() => setIntakeOpen(true)} />
                    </View>
                  )
                }
              />
            </View>
          }
          renderItem={({ item }) => (
            <ClientRow
              client={item}
              atRisk={atRiskIds.has(item.id)}
              onPress={() => router.push(`/(owner)/clients/${item.id}`)}
            />
          )}
        />
      )}

      <IntakeSheet
        visible={intakeOpen}
        onClose={() => {
          setIntakeOpen(false);
          void qc.invalidateQueries({ queryKey: ['clients'] });
        }}
      />
    </Screen>
  );
}

function ClientRow({
  client,
  atRisk,
  onPress,
}: {
  client: ClientListItem;
  atRisk: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const name = client.display_name || client.name;
  const sub = [client.program_type ? titleCase(client.program_type) : null, client.email]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      title={name}
      subtitle={sub}
      avatarText={initials(name)}
      tint={atRisk ? t.colors.danger : client.status === 'active' ? t.colors.success : undefined}
      meta={
        atRisk
          ? 'At risk'
          : client.last_active_at
            ? relativeTime(client.last_active_at)
            : 'Never active'
      }
      onPress={onPress}
    />
  );
}

function PendingRequests({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pill label={`${count} waiting`} tone="warning" />
        <AppText variant="heading" style={{ flex: 1 }}>
          Join requests
        </AppText>
      </View>
      <AppText variant="muted" tone="muted">
        {count === 1
          ? 'Someone signed up with your join link and is waiting for approval.'
          : `${count} people signed up with your join link and are waiting for approval.`}
      </AppText>
      <ActionButton label="Review requests" icon="checkmark-done-outline" onPress={onOpen} />
    </Card>
  );
}

/**
 * Intake sheet — the join link (share/copy/rotate) and a bulk email invite,
 * which together cover how the web page gets clients into a workspace.
 */
function IntakeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [emails, setEmails] = useState('');

  const linkQ = useQuery({
    queryKey: ['clients', 'join-link'],
    queryFn: ownerClientsApi.getJoinLink,
    enabled: visible,
  });

  const rotate = useMutation({
    mutationFn: () => ownerClientsApi.rotateJoinLink(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clients', 'join-link'] }),
    onError: (e: Error) => Alert.alert('Could not rotate link', e.message),
  });

  const invite = useMutation({
    mutationFn: (rows: { email: string }[]) => ownerClientsApi.importClients(rows),
    onSuccess: (res) => {
      setEmails('');
      void qc.invalidateQueries({ queryKey: ['clients'] });
      const skipped = res.skipped.length;
      Alert.alert(
        'Invites processed',
        `${res.created} added${skipped ? `, ${skipped} skipped (already present or invalid)` : ''}.`,
      );
    },
    onError: (e: Error) => Alert.alert('Could not invite', e.message),
  });

  const parsed = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));

  const url = linkQ.data?.url ?? null;

  return (
    <Sheet visible={visible} onClose={onClose} title="Add clients">
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" tone="muted">
          JOIN LINK
        </AppText>
        {linkQ.isLoading ? (
          <Loading />
        ) : url ? (
          <>
            <Card style={{ padding: spacing.md }}>
              <AppText variant="muted" tone="muted" selectable>
                {url}
              </AppText>
            </Card>
            {/* Share only, no clipboard button: expo-clipboard is a native
                module, and this screen has to stay shippable over OTA. The
                URL above is selectable for a manual copy. */}
            <ActionButton
              label="Share join link"
              icon="share-outline"
              onPress={() => void Share.share({ message: url })}
            />
            <ActionButton
              label="Rotate link"
              icon="refresh-outline"
              tone="neutral"
              loading={rotate.isPending}
              onPress={() =>
                Alert.alert(
                  'Rotate join link?',
                  'The current link stops working immediately. Anyone who already has it will need the new one.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Rotate', style: 'destructive', onPress: () => rotate.mutate() },
                  ],
                )
              }
            />
          </>
        ) : (
          <EmptyState
            icon="link-outline"
            title="No active join link"
            body="Create one to let clients sign themselves up."
            action={
              <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
                <ActionButton label="Create link" loading={rotate.isPending} onPress={() => rotate.mutate()} />
              </View>
            }
          />
        )}
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <AppText variant="label" tone="muted">
          INVITE BY EMAIL
        </AppText>
        <Field
          label="Email addresses"
          value={emails}
          onChangeText={setEmails}
          placeholder="asha@example.com, ravi@example.com"
          multiline
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ minHeight: 88, textAlignVertical: 'top' }}
          hint={parsed.length ? `${parsed.length} address${parsed.length === 1 ? '' : 'es'} detected` : 'Separate with commas, spaces or new lines'}
        />
        <ActionButton
          label={parsed.length ? `Invite ${parsed.length}` : 'Invite'}
          icon="mail-outline"
          disabled={!parsed.length}
          loading={invite.isPending}
          onPress={() => invite.mutate(parsed.map((email) => ({ email })))}
        />
      </View>
    </Sheet>
  );
}
