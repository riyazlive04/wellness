/**
 * Overview — the nutritionist's home screen.
 *
 * Same data as the web Overview (pages/sirah/owner/Overview.tsx): every figure
 * comes from analyticsApi, ownerClientsApi, plateVisionApi or programEngineApi.
 * No mock numbers — a panel with nothing to say renders an empty state instead
 * of a plausible-looking placeholder.
 *
 * Reordered for a phone: what needs a decision today (attention queue) sits
 * above what merely reports (KPIs, trends).
 */
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import {
  ActionButton,
  Can,
  EmptyState,
  GradientHero,
  IconButton,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  Section,
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import { analyticsApi } from '@/lib/owner/api/analytics';
import { billingApi } from '@/lib/owner/api/billing';
import { ownerClientsApi } from '@/lib/owner/api/clients';
import { plateVisionApi } from '@/lib/owner/api/plate-vision';
import { programEngineApi } from '@/lib/owner/api/programEngine';
import { spacing } from '@/lib/theme';
import { relativeTime, shortDate, titleCase } from '@/lib/owner/format';

export default function OwnerOverview() {
  const router = useRouter();
  const t = useTheme();
  const { scope, isOwner, can, hasFeature } = useOwner();
  const [refreshing, setRefreshing] = useState(false);

  const kpiQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk() });
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
  const platesQ = useQuery({
    queryKey: ['plates', 'review', 'pending'],
    queryFn: () => plateVisionApi.reviewQueue({ status: 'pending', limit: 5 }),
  });
  const assessQ = useQuery({
    queryKey: ['assessments', 'recent'],
    queryFn: () => ownerClientsApi.recentAssessments(6),
    enabled: can('assessments.manage'),
  });
  const programsQ = useQuery({
    queryKey: ['programs', 'analytics'],
    queryFn: programEngineApi.analytics,
    enabled: can('programs.read'),
  });
  const billingQ = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: billingApi.currentSubscription,
    enabled: isOwner,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      kpiQ.refetch(),
      atRiskQ.refetch(),
      clientsQ.refetch(),
      platesQ.refetch(),
      assessQ.refetch(),
      programsQ.refetch(),
    ]);
    setRefreshing(false);
  }, [kpiQ, atRiskQ, clientsQ, platesQ, assessQ, programsQ]);

  const k = kpiQ.data;
  const atRisk = atRiskQ.data ?? [];
  const plates = platesQ.data ?? [];

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const attentionCount = atRisk.length + plates.length;

  return (
    <OwnerPage
      title={greeting}
      subtitle={scope?.workspaceRole ? 'Your practice today' : undefined}
      actions={
        <>
          <IconButton
            icon="notifications-outline"
            accessibilityLabel="Notifications"
            onPress={() => router.push('/(owner)/more/notifications')}
          />
          <IconButton
            icon="settings-outline"
            accessibilityLabel="Settings"
            onPress={() => router.push('/(owner)/more/settings')}
          />
        </>
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }>
      {/* ── Gradient hero: the one thing worth reading first ── */}
      {kpiQ.isLoading ? (
        <Loading label="Loading your numbers" />
      ) : kpiQ.isError ? (
        <QueryError error={kpiQ.error} onRetry={() => void kpiQ.refetch()} />
      ) : k ? (
        <>
          <GradientHero
            eyebrow="Your practice"
            headline={
              attentionCount
                ? `${attentionCount} ${attentionCount === 1 ? 'thing needs' : 'things need'} you`
                : 'Everything looks steady'
            }
            hint={
              attentionCount
                ? 'Clients who have gone quiet and meal photos waiting on your review.'
                : 'No clients have gone quiet and nothing is waiting for review.'
            }
            badge={
              scope?.plan
                ? { icon: 'sparkles', label: titleCase(scope.plan) }
                : undefined
            }
            stats={[
              { label: 'Active clients', value: k.active_clients },
              { label: 'New this month', value: k.new_clients_month },
              { label: 'Active 7d', value: k.active_7d },
            ]}
            progress={k.active_clients ? k.on_track / k.active_clients : 0}
            progressLabel="On track"
          />

          <Section title="Where your clients stand">
            <TileRow>
              <StatTile label="On track" value={k.on_track} icon="checkmark-circle-outline" tint={t.colors.success} />
              <StatTile label="Needs a nudge" value={k.needs_nudge} icon="hand-left-outline" tint={t.colors.warning} />
              <StatTile label="At risk" value={k.at_risk} icon="alert-circle-outline" tint={t.colors.danger} />
            </TileRow>
          </Section>
        </>
      ) : null}

      {/* ── AI insight ── */}
      {insightsQ.data?.insights ? (
        <Card style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Pill label="AI insight" tone="accent" />
          </View>
          <AppText variant="body">{insightsQ.data.insights}</AppText>
        </Card>
      ) : null}

      {/* ── Needs attention ── */}
      <Section
        title={attentionCount ? `Needs attention · ${attentionCount}` : 'Needs attention'}
        action={
          atRisk.length ? (
            <AppText variant="caption" tone="accent" onPress={() => router.push('/(owner)/clients')}>
              All clients
            </AppText>
          ) : null
        }>
        {atRiskQ.isLoading || platesQ.isLoading ? (
          <Loading />
        ) : !attentionCount ? (
          <EmptyState
            icon="sparkles-outline"
            title="Nothing needs you right now"
            body="No clients have gone quiet and there are no meal photos waiting for review."
          />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {atRisk.slice(0, 5).map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={
                  c.last_active_at
                    ? `Last active ${relativeTime(c.last_active_at)}`
                    : 'Never active since joining'
                }
                avatarText={c.name}
                tint={t.colors.danger}
                meta="At risk"
                onPress={() => router.push(`/(owner)/clients/${c.id}`)}
              />
            ))}
            {plates.length ? (
              <ListRow
                title={`${plates.length} meal photo${plates.length === 1 ? '' : 's'} to review`}
                subtitle="AI analysed them — confirm or correct the portions"
                icon="camera-outline"
                tint={t.colors.warning}
                onPress={() => router.push('/(owner)/more/nutrition?tab=plate-review')}
              />
            ) : null}
          </Card>
        )}
      </Section>

      {/* ── Quick actions ── */}
      <Section title="Quick actions">
        <View style={{ gap: spacing.sm }}>
          <Can permission="clients.read">
            <ActionButton
              label="Add a client"
              icon="person-add-outline"
              onPress={() => router.push('/(owner)/clients?new=1')}
            />
          </Can>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Can permission="messaging.use">
              <View style={{ flex: 1 }}>
                <ActionButton
                  label="Inbox"
                  icon="chatbubble-ellipses-outline"
                  tone="neutral"
                  onPress={() => router.push('/(owner)/messaging')}
                />
              </View>
            </Can>
            {hasFeature('appointments') && can('appointments.manage') ? (
              <View style={{ flex: 1 }}>
                <ActionButton
                  label="Schedule"
                  icon="calendar-outline"
                  tone="neutral"
                  onPress={() => router.push('/(owner)/appointments')}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Section>

      {/* ── Recent clients ── */}
      <Can permission="clients.read">
        <Section
          title="Recent clients"
          action={
            <AppText variant="caption" tone="accent" onPress={() => router.push('/(owner)/clients')}>
              See all
            </AppText>
          }>
          {clientsQ.isLoading ? (
            <Loading />
          ) : clientsQ.isError ? (
            <QueryError error={clientsQ.error} onRetry={() => void clientsQ.refetch()} />
          ) : !clientsQ.data?.items.length ? (
            <EmptyState
              icon="people-outline"
              title="No clients yet"
              body="Share your join link and the first signups will land here."
            />
          ) : (
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
          )}
        </Section>
      </Can>

      {/* ── Assessments awaiting review ── */}
      <Can permission="assessments.manage">
        {assessQ.data?.length ? (
          <Section
            title="Recent assessments"
            action={
              <AppText
                variant="caption"
                tone="accent"
                onPress={() => router.push('/(owner)/more/assessments')}>
                See all
              </AppText>
            }>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {assessQ.data.map((a) => (
                <ListRow
                  key={a.id}
                  title={a.client_name}
                  subtitle={a.title ?? a.card_type.replace(/_/g, ' ')}
                  icon="checkbox-outline"
                  meta={a.band ?? (a.score !== null ? String(a.score) : shortDate(a.submitted_at))}
                  onPress={() => router.push(`/(owner)/clients/${a.client_id}`)}
                />
              ))}
            </Card>
          </Section>
        ) : null}
      </Can>

      {/* ── Programs + engagement ── */}
      <Can permission="programs.read">
        {k ? (
          <Section title="Programs">
            <TileRow>
              <StatTile label="Active programs" value={k.active_programs} icon="clipboard-outline" />
              <StatTile label="Avg progress" value={`${Math.round(k.avg_program_progress)}%`} icon="trending-up-outline" />
            </TileRow>
            <TileRow>
              <StatTile label="On schedule" value={k.programs_on_track} tint={t.colors.success} />
              <StatTile label="Behind" value={k.programs_behind} tint={t.colors.warning} />
            </TileRow>
          </Section>
        ) : null}
      </Can>

      {/* ── Practice health ── */}
      {k ? (
        <Section title="Practice">
          <TileRow>
            <StatTile label="Active last 7d" value={k.active_7d} icon="pulse-outline" />
            <StatTile label="Messages 7d" value={k.messages_7d} icon="chatbubbles-outline" />
          </TileRow>
          {isOwner ? (
            <TileRow>
              <StatTile
                label="MRR"
                value={`₹${k.mrr_inr.toLocaleString('en-IN')}`}
                icon="cash-outline"
                onPress={() => router.push('/(owner)/more/billing')}
              />
              <StatTile
                label="AI calls this month"
                value={k.ai_calls_month}
                icon="sparkles-outline"
                onPress={() => router.push('/(owner)/more/analytics')}
              />
            </TileRow>
          ) : null}
        </Section>
      ) : null}

      {/* ── Subscription status (owner only) ── */}
      {isOwner && billingQ.data?.subscription ? (
        <Card style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="heading" style={{ flex: 1 }}>
              Subscription
            </AppText>
            <Pill
              label={billingQ.data.subscription.status}
              tone={billingQ.data.subscription.status === 'active' ? 'success' : 'warning'}
            />
          </View>
          <AppText variant="muted" tone="muted">
            {billingQ.data.subscription.current_period_end
              ? `Renews ${shortDate(billingQ.data.subscription.current_period_end)}`
              : 'No renewal date on file'}
          </AppText>
          <AppText
            variant="caption"
            tone="accent"
            onPress={() => router.push('/(owner)/more/billing')}>
            Manage billing
          </AppText>
        </Card>
      ) : null}
    </OwnerPage>
  );
}
