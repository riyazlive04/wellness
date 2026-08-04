/**
 * Reports — ports the web Reports page.
 *
 * Pick a template, pick a target where one is needed, and the backend returns
 * the real numbers (`/reports/data`). The web then renders a PDF client-side
 * with jsPDF; the mobile app shows the same data on screen and records the
 * generation in the history, then points at the web for the PDF file itself —
 * there is no jsPDF equivalent in the bundle and adding a PDF renderer for
 * one screen isn't worth the weight.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { BreakdownBars } from '@/components/owner/charts';
import {
  ActionButton,
  EmptyState,
  ListRow,
  Loading,
  OwnerPage,
  Pill,
  RouteGate,
  SearchField,
  SegmentedTabs,
  Sheet,
  StatTile,
  TileRow,
} from '@/components/owner/ui';
import { QueryError } from '@/components/query-state';
import { AppText, Card } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import { ownerClientsApi } from '@/lib/owner/api/clients';
import { programEngineApi } from '@/lib/owner/api/programEngine';
import { reportsApi, type ReportData } from '@/lib/owner/api/reports';
import type { ReportKind } from '@/lib/owner/types/reports';
import { dateTime, initials, inr, pct, relativeTime, titleCase } from '@/lib/owner/format';
import { spacing } from '@/lib/theme';

type Tab = 'templates' | 'history';

interface Template {
  kind: ReportKind;
  name: string;
  description: string;
  needsTarget?: 'client' | 'program';
}

/** Mirrors REPORT_TEMPLATES in the web module (reports/data/mockReports.ts). */
const TEMPLATES: Template[] = [
  {
    kind: 'client_health',
    name: 'Client Health Report',
    description: 'Full picture for one client — share with them or their doctor.',
    needsTarget: 'client',
  },
  {
    kind: 'client_monthly',
    name: 'Client Monthly Summary',
    description: 'A one-page monthly recap for a client.',
    needsTarget: 'client',
  },
  {
    kind: 'program_performance',
    name: 'Program Performance',
    description: 'Completion, dropout and progress for one program.',
    needsTarget: 'program',
  },
  {
    kind: 'workspace_digest',
    name: 'Workspace Digest',
    description: 'Everything at practice level: growth, engagement, nutrition, AI.',
  },
  {
    kind: 'billing_gst',
    name: 'GST Billing Summary',
    description: 'Invoices and tax for the period.',
  },
];

export default function OwnerReports() {
  return (
    <RouteGate permission="reports.view">
      <ReportsInner />
    </RouteGate>
  );
}

function ReportsInner() {
  const t = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('templates');
  const [refreshing, setRefreshing] = useState(false);
  const [picking, setPicking] = useState<Template | null>(null);
  const [viewing, setViewing] = useState<{ template: Template; targetId?: string; targetLabel?: string } | null>(null);

  const listQ = useQuery({ queryKey: ['reports'], queryFn: reportsApi.list });
  const statsQ = useQuery({ queryKey: ['reports', 'stats'], queryFn: reportsApi.stats });

  const remove = useMutation({
    mutationFn: (id: string) => reportsApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reports'] }),
    onError: (e: Error) => Alert.alert('Could not delete', e.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([listQ.refetch(), statsQ.refetch()]);
    setRefreshing(false);
  };

  const s = statsQ.data;

  return (
    <OwnerPage
      title="Reports"
      subtitle="Summaries and audits"
      back
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
      }
      contentStyle={{ paddingHorizontal: 0 }}>
      {s ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <TileRow>
            <StatTile label="This month" value={s.monthCount} icon="document-text-outline" />
            <StatTile label="In progress" value={s.inProgress} icon="hourglass-outline" />
            <StatTile label="Total" value={s.total} icon="albums-outline" />
          </TileRow>
        </View>
      ) : null}

      <SegmentedTabs
        options={[
          { key: 'templates', label: 'Generate' },
          { key: 'history', label: 'History', badge: listQ.data?.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {tab === 'templates' ? (
          TEMPLATES.map((tpl) => (
            <Card key={tpl.kind} style={{ gap: spacing.sm }}>
              <AppText variant="heading">{tpl.name}</AppText>
              <AppText variant="muted" tone="muted">
                {tpl.description}
              </AppText>
              {tpl.needsTarget ? <Pill label={`Needs a ${tpl.needsTarget}`} /> : null}
              <ActionButton
                label="Generate"
                icon="document-text-outline"
                onPress={() => (tpl.needsTarget ? setPicking(tpl) : setViewing({ template: tpl }))}
              />
            </Card>
          ))
        ) : listQ.isLoading ? (
          <Loading />
        ) : listQ.isError ? (
          <QueryError error={listQ.error} onRetry={() => void listQ.refetch()} />
        ) : !listQ.data?.length ? (
          <EmptyState icon="document-text-outline" title="Nothing generated yet" />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {listQ.data.map((r) => (
              <ListRow
                key={r.id}
                title={r.templateName}
                subtitle={[r.target, r.period, `by ${r.generatedBy}`].filter(Boolean).join(' · ')}
                icon="document-text-outline"
                tint={r.status === 'failed' ? t.colors.danger : undefined}
                meta={relativeTime(r.generatedAt)}
                right={
                  <AppText variant="caption" tone="danger" onPress={() => remove.mutate(r.id)}>
                    Delete
                  </AppText>
                }
              />
            ))}
          </Card>
        )}
      </View>

      <TargetPicker
        template={picking}
        onClose={() => setPicking(null)}
        onPick={(targetId, targetLabel) => {
          const tpl = picking!;
          setPicking(null);
          setViewing({ template: tpl, targetId, targetLabel });
        }}
      />

      <ReportSheet request={viewing} onClose={() => setViewing(null)} />
    </OwnerPage>
  );
}

function TargetPicker({
  template,
  onClose,
  onPick,
}: {
  template: Template | null;
  onClose: () => void;
  onPick: (id: string, label: string) => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const wantsClient = template?.needsTarget === 'client';

  const clientsQ = useQuery({
    queryKey: ['clients', 'list', debounced, 'all'],
    queryFn: () => ownerClientsApi.list({ q: debounced || undefined, limit: 50 }),
    enabled: !!template && wantsClient,
  });
  const programsQ = useQuery({
    queryKey: ['programs', 'templates'],
    queryFn: programEngineApi.listTemplates,
    enabled: !!template && !wantsClient,
  });

  return (
    <Sheet visible={!!template} onClose={onClose} title={`Pick a ${template?.needsTarget ?? 'target'}`}>
      {wantsClient ? (
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search clients" />
          {clientsQ.isLoading ? (
            <Loading />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {(clientsQ.data?.items ?? []).map((c) => (
                <ListRow
                  key={c.id}
                  title={c.display_name || c.name}
                  subtitle={c.email}
                  avatarText={initials(c.display_name || c.name)}
                  onPress={() => onPick(c.id, c.display_name || c.name)}
                />
              ))}
            </Card>
          )}
        </>
      ) : programsQ.isLoading ? (
        <Loading />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {(programsQ.data ?? []).map((p) => (
            <ListRow key={p.id} title={p.name} icon="clipboard-outline" onPress={() => onPick(p.id, p.name)} />
          ))}
        </Card>
      )}
    </Sheet>
  );
}

function ReportSheet({
  request,
  onClose,
}: {
  request: { template: Template; targetId?: string; targetLabel?: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const dataQ = useQuery({
    queryKey: ['reports', 'data', request?.template.kind, request?.targetId],
    queryFn: () => reportsApi.data(request!.template.kind, request?.targetId),
    enabled: !!request,
  });

  const record = useMutation({
    mutationFn: () =>
      reportsApi.record({
        kind: request!.template.kind,
        templateName: request!.template.name,
        targetLabel: request?.targetLabel ?? null,
        targetId: request?.targetId ?? null,
        periodLabel: dataQ.data?.periodLabel,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reports'] });
      onClose();
      Alert.alert('Saved to history', 'Download the PDF from the web app.');
    },
    onError: (e: Error) => Alert.alert('Could not record', e.message),
  });

  return (
    <Sheet visible={!!request} onClose={onClose} title={request?.template.name ?? 'Report'}>
      {dataQ.isLoading ? (
        <Loading label="Pulling the numbers" />
      ) : dataQ.isError ? (
        <QueryError error={dataQ.error} onRetry={() => void dataQ.refetch()} />
      ) : dataQ.data ? (
        <>
          <AppText variant="caption" tone="faint">
            {`${dataQ.data.workspaceName} · ${dataQ.data.periodLabel} · generated ${dateTime(dataQ.data.generatedAt)}`}
          </AppText>
          {dataQ.data.unsupported ? (
            <EmptyState
              icon="construct-outline"
              title="Not available yet"
              body="This report kind has no data source on the server yet."
            />
          ) : (
            <ReportBody data={dataQ.data} />
          )}
          {!dataQ.data.unsupported ? (
            <ActionButton
              label="Save to history"
              icon="save-outline"
              loading={record.isPending}
              onPress={() => record.mutate()}
            />
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function ReportBody({ data }: { data: ReportData }) {
  if (data.client) {
    const c = data.client;
    return (
      <>
        <Card style={{ gap: spacing.xs }}>
          <AppText variant="heading">{c.name}</AppText>
          <AppText variant="muted" tone="muted">
            {[c.email, c.phone, c.age ? `${c.age}y` : null, c.gender ? titleCase(c.gender) : null]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
          {c.goals ? <AppText variant="body">{c.goals}</AppText> : null}
        </Card>
        {c.program ? (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="label" tone="faint">
              PROGRAM
            </AppText>
            <AppText variant="body">{c.program.name}</AppText>
            <AppText variant="muted" tone="muted">
              {`${titleCase(c.program.status)} · ${pct(c.program.progressPct)}`}
            </AppText>
          </Card>
        ) : null}
        <Card style={{ gap: spacing.xs }}>
          <AppText variant="label" tone="faint">
            NUTRITION — LAST 30 DAYS
          </AppText>
          <AppText variant="body">
            {`${Math.round(c.nutrition30d.avgDailyKcal)} kcal/day · ${c.nutrition30d.mealCount} meals · ${c.nutrition30d.daysActive} active days`}
          </AppText>
          <BreakdownBars
            rows={[
              { label: 'Protein', value: c.nutrition30d.proteinG, hint: `${Math.round(c.nutrition30d.proteinG)} g` },
              { label: 'Carbs', value: c.nutrition30d.carbG, hint: `${Math.round(c.nutrition30d.carbG)} g` },
              { label: 'Fat', value: c.nutrition30d.fatG, hint: `${Math.round(c.nutrition30d.fatG)} g` },
            ]}
          />
        </Card>
      </>
    );
  }

  if (data.program) {
    const p = data.program;
    return (
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">{p.name}</AppText>
        <AppText variant="muted" tone="muted">
          {[p.category ? titleCase(p.category) : null, p.durationWeeks ? `${p.durationWeeks} weeks` : null]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        <TileRow>
          <StatTile label="Enrolled" value={p.enrolled} />
          <StatTile label="Active" value={p.active} />
          <StatTile label="Completed" value={p.completed} />
        </TileRow>
        <BreakdownBars
          rows={[
            { label: 'Avg progress', value: p.avgProgress, hint: pct(p.avgProgress) },
            { label: 'Completion rate', value: p.completionRate, hint: pct(p.completionRate) },
            { label: 'Dropout rate', value: p.dropoutRate, hint: pct(p.dropoutRate) },
          ]}
        />
      </Card>
    );
  }

  if (data.digest) {
    const d = data.digest;
    return (
      <>
        {d.overview ? (
          <>
            <TileRow>
              <StatTile label="Clients" value={d.overview.total_clients} />
              <StatTile label="Active" value={d.overview.active_clients} />
              <StatTile label="New" value={d.overview.new_clients_month} />
            </TileRow>
            <TileRow>
              <StatTile label="Programs" value={d.overview.active_programs} />
              <StatTile label="Messages 7d" value={d.overview.messages_7d} />
              <StatTile label="MRR" value={inr(d.overview.mrr_inr)} />
            </TileRow>
          </>
        ) : null}
        {d.programs.by_status.length ? (
          <Card>
            <BreakdownBars
              rows={d.programs.by_status.map((s) => ({
                label: titleCase(s.status),
                value: s.count,
                hint: `${s.count} · ${pct(s.avg_progress)}`,
              }))}
            />
          </Card>
        ) : null}
        {d.nutrition ? (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="label" tone="faint">
              NUTRITION
            </AppText>
            <AppText variant="body">
              {`${Math.round(d.nutrition.avg_daily_kcal)} kcal/day average · ${d.nutrition.meal_count} meals`}
            </AppText>
          </Card>
        ) : null}
        {d.aiUsage.by_service.length ? (
          <Card>
            <BreakdownBars
              rows={d.aiUsage.by_service.map((s) => ({ label: titleCase(s.service), value: s.calls }))}
            />
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <EmptyState icon="document-outline" title="Nothing to show" body="The server returned no data for this period." />
  );
}
