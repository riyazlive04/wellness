/**
 * Inbox — every client conversation, newest activity first.
 *
 * Ports the conversation list half of the web Messaging page
 * (pages/sirah/owner/Messaging.tsx). The web version is a two-pane layout;
 * on a phone the list and the thread are separate screens.
 *
 * Polls every 15s while focused rather than holding a socket: the same
 * near-realtime approach the client portal's chat already uses, and it doesn't
 * keep the radio awake in the background.
 */
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import {
  EmptyState,
  ListRow,
  Loading,
  OwnerHeader,
  SearchField,
  SegmentedTabs,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { Screen } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import { ownerClientsApi } from '@/lib/owner/api/clients';
import { initials, relativeTime } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Filter = 'all' | 'unread';

export default function OwnerInbox() {
  const router = useRouter();
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const debounced = useDebouncedValue(query, 250);

  const convosQ = useQuery({
    queryKey: ['messaging', 'conversations'],
    queryFn: ownerClientsApi.listConversations,
    refetchInterval: 15_000,
  });

  const rows = useMemo(() => {
    let list = convosQ.data ?? [];
    if (filter === 'unread') list = list.filter((c) => c.unread > 0);
    if (debounced) {
      const q = debounced.toLowerCase();
      list = list.filter((c) => c.client_name.toLowerCase().includes(q));
    }
    return list;
  }, [convosQ.data, filter, debounced]);

  const unreadTotal = (convosQ.data ?? []).reduce((s, c) => s + c.unread, 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await convosQ.refetch();
    setRefreshing(false);
  };

  return (
    <Screen>
      <OwnerHeader
        title="Inbox"
        subtitle={unreadTotal ? `${unreadTotal} unread` : 'All caught up'}
      />

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search conversations" />
      </View>
      <View style={{ paddingBottom: spacing.sm }}>
        <SegmentedTabs
          options={[
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread', badge: unreadTotal || undefined },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>

      {convosQ.isLoading ? (
        <Loading label="Loading conversations" />
      ) : convosQ.isError ? (
        <View style={{ padding: spacing.lg }}>
          <QueryError error={convosQ.error} onRetry={() => void convosQ.refetch()} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.client_id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
          }
          contentContainerStyle={{ paddingBottom: spacing['3xl'] * 2 }}
          ListEmptyComponent={
            <View style={{ padding: spacing.lg }}>
              <EmptyState
                icon="chatbubbles-outline"
                title={filter === 'unread' ? 'Nothing unread' : 'No conversations'}
                body={
                  filter === 'unread'
                    ? "You've replied to everyone."
                    : 'Once a client messages you, the thread appears here.'
                }
              />
            </View>
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.client_name}
              subtitle={
                item.last_message
                  ? `${item.last_sender === 'admin' ? 'You: ' : ''}${item.last_message}`
                  : 'No messages yet'
              }
              avatarText={initials(item.client_name)}
              tint={item.unread ? t.colors.accent : undefined}
              meta={item.last_message_at ? relativeTime(item.last_message_at) : undefined}
              badge={item.unread || undefined}
              onPress={() => router.push(`/(owner)/messaging/${item.client_id}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}
