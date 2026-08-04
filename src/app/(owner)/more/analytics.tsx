/**
 * Analytics — ports the web Analytics page (Module 10).
 *
 * Every panel reads the same analyticsApi endpoint the web dashboard does:
 * growth, engagement, nutrition trends, program performance, AI usage, ops and
 * revenue. Revenue is additionally gated on `revenue_analytics`, matching the
 * backend.
 */
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { BarChart, BreakdownBars, DonutRing } from '@/components/owner/charts';
import {
  EmptyState,
  ListRow,
  Loading,
  OwnerPage,
  RouteGate,
  Section,
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useOwner } from '@/contexts/owner-context';
import { useTheme } from '@/hooks/use-theme';
import { analyticsApi } from '@/lib/owner/api/analytics';
import { dateTime, initials, inr, pct, relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

export default function OwnerAnalytics() {
  return (
    <RouteGate permission="analytics.view" feature="analytics" featureLabel="Analytics">
      <AnalyticsInner />
    </RouteGate>
  );
}

function AnalyticsInner() {
  const t = useTheme();
  const router = useRouter();
  const { hasFeature } = useOwner();
  const [refreshing, setRefreshing] = useState(false);

  const kpiQ = useQuery({ queryKey: ['analytics', 'overview'], queryFn: analyticsApi.overview });
  const growthQ = useQuery({ queryKey: ['analytics', 'growth'], queryFn: () => analyticsApi.clientGrowth(6) });
  const engagementQ = useQuery({ queryKey: ['analytics', 'engagement'], queryFn: () => analyticsApi.engagement(30) });
  const nutritionQ = useQuery({
    queryKey: ['analytics', 'nutrition-trends'],
    queryFn: () => analyticsApi.nutritionTrends(30),
  });
  const programsQ = useQuery({ queryKey: ['analytics', 'program-performance'], queryFn: analyticsApi.programPerformance });
  const aiQ = useQuery({ queryKey: ['analytics', 'ai-usage'], queryFn: () => analyticsApi.aiUsage(14) });
  const opsQ = useQuery({ queryKey: ['analytics', 'ops'], queryFn: analyticsApi.ops });
  const atRiskQ = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: () => analyticsApi.atRisk() });
  const revenueQ = useQuery({
    queryKey: ['analytics', 'revenue'],
    queryFn: analyticsApi.revenue,
    enabled: hasFeature('revenue_analytics'),
  });
  const insightsQ = useQuery({
    queryKey: ['analytics', 'insights'],
    queryFn: analyticsApi.insights,
    staleTime: 10 * 60 * 1000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([
      kpiQ.refetch(),
      growthQ.refetch(),
      engagementQ.refetch(),
      nutritionQ.refetch(),
      programsQ.refetch(),
      aiQ.refetch(),
      opsQ.refetch(),
      atRiskQ.refetch(),
      revenueQ.refetch(),
    ]);
    setRefreshing(false);
  };

  const k = kpiQ.data;
  const n = nutritionQ.data;

  return (
    <OwnerPage
      title="Analytics"
      subtitle="Growth, engagement, outcomes"
      back
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }>
      {kpiQ.isLoading ? (
        <Loading label="Crunching your numbers" />
      ) : kpiQ.isError ? (
        <QueryError error={kpiQ.error} onRetry={() => void kpiQ.refetch()} lockedFeature="Analytics" />
      ) : k ? (
        <>
          <TileRow>
            <StatTile label="Total clients" value={k.total_clients} icon="people-outline" />
            <StatTile label="Active" value={k.active_clients} icon="pulse-outline" tint={t.colors.success} />
            <StatTile label="New this month" value={k.new_clients_month} icon="person-add-outline" />
          </TileRow>
          <TileRow>
            <StatTile label="Active last 7d" value={k.active_7d} icon="calendar-outline" />
            <StatTile label="Messages 7d" value={k.messages_7d} icon="chatbubbles-outline" />
            <StatTile label="AI calls" value={k.ai_calls_month} icon="sparkles-outline" />
          </TileRow>
        </>
      ) : null}

      {insightsQ.data?.insights ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="label" tone="faint">
            AI READ ON THE NUMBERS
          </AppText>
          <AppText variant="body">{insightsQ.data.insights}</AppText>
        </Card>
      ) : null}

      <Section title="Client growth">
        <Card style={{ gap: spacing.sm }}>
          <BarChart
            values={(growthQ.data ?? []).map((g) => g.count)}
            labels={(growthQ.data ?? []).map((g) => g.month)}
            emptyLabel="No signups in this window."
          />
          <AppText variant="caption" tone="faint">
            New clients per month, last 6 months
          </AppText>
        </Card>
      </Section>

      <Section title="Daily engagement">
        <Card style={{ gap: spacing.sm }}>
          <BarChart
            values={(engagementQ.data ?? []).map((e) => e.active)}
            labels={(engagementQ.data ?? []).map((e) => e.day)}
            emptyLabel="No activity recorded."
          />
          <AppText variant="caption" tone="faint">
            Clients active per day, last 30 days
          </AppText>
        </Card>
      </Section>

      {n ? (
        <Section title="Nutrition across your practice">
          <Card style={{ gap: spacing.md }}>
            <DonutRing
              segments={[
                { label: 'Protein', value: n.protein_g, color: t.colors.success },
                { label: 'Carbohydrate', value: n.carb_g, color: t.colors.accent },
                { label: 'Fat', value: n.fat_g, color: t.colors.warning },
              ]}
            />
            <AppText variant="caption" tone="faint">
              {`${Math.round(n.avg_daily_kcal)} kcal average per day · ${n.meal_count} meals logged in 30 days`}
            </AppText>
          </Card>
        </Section>
      ) : null}

      <Section title="Program performance">
        {programsQ.isLoading ? (
          <Loading />
        ) : !programsQ.data?.by_status.length ? (
          <EmptyState icon="clipboard-outline" title="No programs running" />
        ) : (
          <Card>
            <BreakdownBars
              rows={programsQ.data.by_status.map((s) => ({
                label: titleCase(s.status),
                value: s.count,
                hint: `${s.count} · ${pct(s.avg_progress)}`,
              }))}
            />
          </Card>
        )}
      </Section>

      {opsQ.data ? (
        <Section title="Operations">
          <TileRow>
            <StatTile label="Upcoming sessions" value={opsQ.data.appointments.upcoming} icon="calendar-outline" />
            <StatTile label="Completed" value={opsQ.data.appointments.completed} icon="checkmark-done-outline" />
            <StatTile
              label="Cancelled"
              value={opsQ.data.appointments.cancelled}
              icon="close-circle-outline"
              tint={t.colors.danger}
            />
          </TileRow>
          {opsQ.data.appointments.next_at ? (
            <AppText variant="caption" tone="faint">
              {`Next session ${dateTime(opsQ.data.appointments.next_at)}`}
            </AppText>
          ) : null}
          <TileRow>
            <StatTile label="Assessments sent" value={opsQ.data.assessments.sent} icon="send-outline" />
            <StatTile label="Submitted" value={opsQ.data.assessments.submitted} icon="checkbox-outline" />
            <StatTile
              label="Awaiting review"
              value={opsQ.data.assessments.awaiting_review}
              icon="hourglass-outline"
              tint={t.colors.warning}
            />
          </TileRow>
        </Section>
      ) : null}

      <Section title="AI usage">
        <Card style={{ gap: spacing.md }}>
          <BarChart
            values={(aiQ.data?.daily ?? []).map((d) => d.calls)}
            labels={(aiQ.data?.daily ?? []).map((d) => d.day)}
            emptyLabel="No AI calls in this window."
          />
          {aiQ.data?.by_service.length ? (
            <BreakdownBars
              rows={aiQ.data.by_service.map((s) => ({ label: titleCase(s.service), value: s.calls }))}
            />
          ) : null}
        </Card>
      </Section>

      {hasFeature('revenue_analytics') ? (
        <Section title="Revenue">
          {revenueQ.isLoading ? (
            <Loading />
          ) : revenueQ.isError ? (
            <QueryError
              error={revenueQ.error}
              onRetry={() => void revenueQ.refetch()}
              lockedFeature="Revenue analytics"
            />
          ) : revenueQ.data ? (
            <Card style={{ gap: spacing.md }}>
              <BarChart
                values={revenueQ.data.mrr_trend.map((m) => m.mrr_inr)}
                labels={revenueQ.data.mrr_trend.map((m) => m.month)}
                emptyLabel="No revenue recorded."
              />
              <BreakdownBars
                rows={revenueQ.data.plan_breakdown.map((p) => ({
                  label: titleCase(p.plan),
                  value: p.mrr_inr,
                  hint: `${p.count} · ${inr(p.mrr_inr)}`,
                }))}
              />
            </Card>
          ) : null}
        </Section>
      ) : null}

      <Section
        title={atRiskQ.data?.length ? `At risk · ${atRiskQ.data.length}` : 'At risk'}
        action={
          <AppText variant="caption" tone="accent" onPress={() => router.push('/(owner)/clients')}>
            All clients
          </AppText>
        }>
        {!atRiskQ.data?.length ? (
          <EmptyState icon="shield-checkmark-outline" title="Nobody has gone quiet" />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {atRiskQ.data.map((c) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={c.last_meal_at ? `Last meal ${relativeTime(c.last_meal_at)}` : 'No meals logged'}
                avatarText={initials(c.name)}
                tint={t.colors.danger}
                meta={c.last_active_at ? relativeTime(c.last_active_at) : 'Never'}
                onPress={() => router.push(`/(owner)/clients/${c.id}`)}
              />
            ))}
          </Card>
        )}
      </Section>
    </OwnerPage>
  );
}
