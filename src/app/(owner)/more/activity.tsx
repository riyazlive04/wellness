/**
 * Activity — ports the web owner Activity page: the workspace audit trail.
 *
 * Searchable and filterable by action, with the full request payload behind a
 * tap. Plan-gated on `audit_logs` (Scale Pro), permission-gated on
 * `audit.view` — both mirrored from the nav map.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import {
  EmptyState,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  RouteGate,
  SearchField,
  SegmentedTabs,
  Sheet,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import { activityLogApi, type ActivityAction, type ActivityLogRow } from '@/lib/owner/api/activity-log';
import { dateTime, initials, relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Filter = 'all' | ActivityAction;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'create', label: 'Created' },
  { key: 'update', label: 'Updated' },
  { key: 'delete', label: 'Deleted' },
  { key: 'invoke', label: 'Invoked' },
];

export default function OwnerActivity() {
  return (
    <RouteGate permission="audit.view" feature="audit_logs" featureLabel="Audit logs">
      <ActivityInner />
    </RouteGate>
  );
}

function ActivityInner() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<Filter>('all');
  const [open, setOpen] = useState<ActivityLogRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const debounced = useDebouncedValue(search, 300);

  const logQ = useQuery({
    queryKey: ['activity', debounced, action],
    queryFn: () =>
      activityLogApi.listForWorkspace({
        limit: 100,
        search: debounced || undefined,
        action: action === 'all' ? undefined : action,
      }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await logQ.refetch();
    setRefreshing(false);
  };

  const toneFor = (row: ActivityLogRow) => {
    if (row.status_code >= 500) return t.colors.danger;
    if (row.status_code >= 400) return t.colors.warning;
    if (row.action === 'delete') return t.colors.danger;
    return undefined;
  };

  return (
    <OwnerPage
      title="Activity"
      subtitle="Who changed what, and when"
      back
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }
      contentStyle={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <SearchField value={search} onChangeText={setSearch} placeholder="Search route, entity or actor" />
      </View>
      <SegmentedTabs options={FILTERS} value={action} onChange={setAction} />

      <View style={{ paddingHorizontal: spacing.lg }}>
        {logQ.isLoading ? (
          <Loading />
        ) : logQ.isError ? (
          <QueryError error={logQ.error} onRetry={() => void logQ.refetch()} lockedFeature="Audit logs" />
        ) : !logQ.data?.length ? (
          <EmptyState
            icon="pulse-outline"
            title={debounced || action !== 'all' ? 'No matching activity' : 'No activity recorded'}
          />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {logQ.data.map((row) => (
              <ListRow
                key={row.id}
                title={`${row.http_method} ${row.entity_type ? titleCase(row.entity_type) : row.route}`}
                subtitle={[
                  row.actor_name ?? row.actor_email ?? 'System',
                  row.actor_role ? titleCase(row.actor_role) : null,
                  `${row.status_code}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                avatarText={initials(row.actor_name ?? row.actor_email ?? 'SYS')}
                tint={toneFor(row)}
                meta={relativeTime(row.created_at)}
                onPress={() => setOpen(row)}
              />
            ))}
          </Card>
        )}
      </View>

      <Sheet visible={!!open} onClose={() => setOpen(null)} title="Activity detail">
        {open ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
              <Pill label={titleCase(open.action)} tone="accent" />
              <Pill
                label={`${open.status_code}`}
                tone={open.status_code >= 400 ? 'danger' : 'success'}
              />
              {open.latency_ms !== null ? <Pill label={`${open.latency_ms} ms`} /> : null}
            </View>

            <Card style={{ gap: spacing.xs }}>
              <Line label="When" value={dateTime(open.created_at)} />
              <Line label="Actor" value={open.actor_name ?? open.actor_email ?? 'System'} />
              <Line label="Role" value={open.actor_role ? titleCase(open.actor_role) : '—'} />
              <Line label="Route" value={`${open.http_method} ${open.route}`} />
              <Line label="Entity" value={open.entity_type ? `${open.entity_type} ${open.entity_id ?? ''}`.trim() : '—'} />
              <Line label="IP" value={open.ip ?? '—'} />
              <Line label="Request id" value={open.request_id ?? '—'} />
            </Card>

            {open.error_message ? (
              <Card style={{ gap: spacing.xs }}>
                <AppText variant="label" tone="faint">
                  ERROR
                </AppText>
                <AppText variant="muted" tone="danger">
                  {open.error_message}
                </AppText>
              </Card>
            ) : null}

            {open.payload ? (
              <Card style={{ gap: spacing.xs }}>
                <AppText variant="label" tone="faint">
                  PAYLOAD
                </AppText>
                <AppText variant="caption" tone="muted" selectable>
                  {JSON.stringify(open.payload, null, 2)}
                </AppText>
              </Card>
            ) : null}

            {open.user_agent ? (
              <AppText variant="caption" tone="faint">
                {open.user_agent}
              </AppText>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </OwnerPage>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <AppText variant="muted" tone="muted">
        {label}
      </AppText>
      <AppText variant="muted" style={{ flexShrink: 1, textAlign: 'right' }} selectable>
        {value}
      </AppText>
    </View>
  );
}
