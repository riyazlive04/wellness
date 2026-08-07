import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Clock, Repeat, Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';

import { Glass, fadeUp, stagger, SirahLoader } from '@/design-system';
import { OwnerLayout } from '@/modules/workspace/OwnerLayout';
import { KPICard } from '@/modules/workspace/components/KPICard';
import { TemplateCard } from '@/modules/workspace/reports/components/TemplateCard';
import { GeneratedRow } from '@/modules/workspace/reports/components/GeneratedRow';
import { ReportTargetDialog, type TargetChoice } from '@/modules/workspace/reports/components/ReportTargetDialog';
import { REPORT_TEMPLATES } from '@/modules/workspace/reports/data/mockReports';
import { generateReportPdf } from '@/modules/workspace/reports/reportPdf';
import { reportsApi, type ReportRow } from '@/modules/workspace/api/reports';
import type { GeneratedReport, ReportStatus, ReportTemplate } from '@/modules/workspace/reports/types';
import { cn } from '@/lib/utils';
import i18n from '@/i18n';

export default function OwnerReports() {
  const { t } = useTranslation('ownerReports');
  const workspace = readWorkspace();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'ready' | 'in_progress'>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ template: ReportTemplate; kind: 'client' | 'program' } | null>(null);

  const statsQ = useQuery({ queryKey: ['reports-stats'], queryFn: () => reportsApi.stats() });
  const listQ = useQuery({ queryKey: ['reports-list'], queryFn: () => reportsApi.list() });

  const stats = statsQ.data ?? { monthCount: 0, inProgress: 0, total: 0, scheduledCount: 0 };
  const rows = listQ.data ?? [];

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'ready') return rows.filter((g) => g.status === 'ready');
    return rows.filter((g) => g.status !== 'ready' && g.status !== 'failed');
  }, [filter, rows]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => reportsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports-list'] });
      qc.invalidateQueries({ queryKey: ['reports-stats'] });
      toast.success(t('toast.removed'));
    },
    onError: (e) => toast.error((e as Error).message || t('toast.deleteFailed')),
  });

  /** Fetch real numbers, render the PDF, and (optionally) record it in history. */
  async function runGenerate(
    template: Pick<ReportTemplate, 'kind' | 'name'>,
    target?: TargetChoice,
    opts: { record?: boolean } = { record: true },
  ) {
    const key = target ? `${template.kind}:${target.id}` : template.kind;
    if (busyKey) return;
    setBusyKey(key);
    const toastId = toast.loading(t('toast.generating', { name: template.name }));
    try {
      const data = await reportsApi.data(template.kind, target?.id);
      if (data.unsupported) {
        toast.dismiss(toastId);
        toast(t('toast.comingSoon'));
        return;
      }
      const { pageCount, sizeKb } = await generateReportPdf(data);
      if (opts.record) {
        await reportsApi.record({
          kind: template.kind,
          templateName: template.name,
          targetLabel: data.target?.label ?? null,
          targetId: data.target?.id ?? null,
          periodLabel: data.periodLabel,
          pageCount,
          sizeKb,
        });
        qc.invalidateQueries({ queryKey: ['reports-list'] });
        qc.invalidateQueries({ queryKey: ['reports-stats'] });
      }
      toast.dismiss(toastId);
      toast.success(t('toast.downloaded', { name: template.name }));
    } catch (e) {
      toast.dismiss(toastId);
      toast.error((e as Error).message || t('toast.generateFailed'));
    } finally {
      setBusyKey(null);
    }
  }

  function onTemplateGenerate(template: ReportTemplate) {
    if (template.needsTarget) {
      setPicker({ template, kind: template.needsTarget });
    } else {
      void runGenerate(template);
    }
  }

  function onRowDownload(r: ReportRow) {
    void runGenerate(
      { kind: r.kind, name: r.templateName },
      r.targetId && r.target ? { id: r.targetId, label: r.target } : undefined,
      { record: false },
    );
  }

  const loading = statsQ.isLoading || listQ.isLoading;

  return (
    <OwnerLayout
      practiceName={workspace.practiceName}
      ownerName={workspace.ownerName}
      initials={workspace.initials}
      topbarContext={t('topbar.reportsGenerated', { count: stats.total })}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:py-10">
        <motion.div variants={stagger(0.05, 0.04)} initial="initial" animate="animate" className="space-y-7">
          {/* Header */}
          <motion.div variants={fadeUp} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-[hsl(var(--brand-blue))] text-xs font-bold uppercase tracking-[0.18em]">{t('common:nav.reports')}</span>
              <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight md:text-4xl">
                {t('header.title')}
              </h1>
              <p className="mt-1.5 text-sm text-foreground/55">
                {t('header.subtitle')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => toast(t('toast.customReportSoon'))}
              className="inline-flex w-fit items-center gap-2 self-start rounded-full border border-foreground/[0.06] bg-card px-4 py-2.5 text-sm font-semibold text-foreground/85 shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <span className="grid h-6 w-6 place-items-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-500/[0.16] dark:text-teal-300">
                <Plus className="h-3.5 w-3.5" />
              </span>
              {t('header.customReport')}
            </button>
          </motion.div>

          {/* KPI strip */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard icon={FileText} label={t('kpi.generatedThisMonth')} value={String(stats.monthCount)} hint={t('kpi.generatedThisMonthHint')} accent="indigo" />
            <KPICard icon={Clock} label={t('kpi.inProgress')} value={String(stats.inProgress)} hint={stats.inProgress > 0 ? t('kpi.inProgressHintActive') : t('kpi.inProgressHintIdle')} accent="sand" />
            <KPICard icon={Repeat} label={t('kpi.scheduled')} value={String(stats.scheduledCount)} hint={t('kpi.scheduledHint')} accent="sage" />
          </motion.div>

          {/* Templates grid */}
          <motion.section variants={fadeUp}>
            <div className="mb-4">
              <div className="text-[hsl(var(--brand-blue))] text-[10px] font-bold uppercase tracking-[0.18em]">{t('templates.eyebrow')}</div>
              <div className="mt-0.5 text-base font-extrabold tracking-tight text-foreground">{t('templates.title')}</div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {REPORT_TEMPLATES.map((tpl) => (
                <TemplateCard
                  key={tpl.kind}
                  template={tpl}
                  onGenerate={() => onTemplateGenerate(tpl)}
                  onSchedule={() => toast(t('toast.scheduleSoon'))}
                />
              ))}
            </div>
          </motion.section>

          {/* Recently generated */}
          <motion.section variants={fadeUp}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[hsl(var(--brand-blue))] text-[10px] font-bold uppercase tracking-[0.18em]">{t('history.eyebrow')}</div>
                <div className="mt-0.5 text-base font-extrabold tracking-tight text-foreground">{t('history.title')}</div>
              </div>

              <div className="flex items-center gap-1 self-start rounded-full border border-foreground/[0.06] bg-card p-1 shadow-sm sm:self-auto">
                <FilterPill label={t('history.filters.all')} active={filter === 'all'} onClick={() => setFilter('all')} count={rows.length} />
                <FilterPill label={t('history.filters.ready')} active={filter === 'ready'} onClick={() => setFilter('ready')} count={rows.filter((g) => g.status === 'ready').length} />
                <FilterPill label={t('history.filters.inProgress')} active={filter === 'in_progress'} onClick={() => setFilter('in_progress')} count={stats.inProgress} />
              </div>
            </div>

            <Glass className="overflow-hidden">
              <div className="hidden grid-cols-[1.6fr_1fr_120px_180px_120px] gap-3 border-b border-foreground/[0.04] px-5 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/75 dark:text-foreground/55 md:grid">
                <div>{t('history.columns.report')}</div>
                <div>{t('history.columns.generatedBy')}</div>
                <div>{t('history.columns.size')}</div>
                <div>{t('history.columns.status')}</div>
                <div className="text-right">{t('history.columns.actions')}</div>
              </div>
              {loading ? (
                <div className="flex justify-center py-12"><SirahLoader /></div>
              ) : (
                <ul>
                  {visible.length === 0 ? (
                    <li className="px-5 py-12 text-center text-xs text-foreground/75 dark:text-foreground/55">
                      {rows.length === 0
                        ? t('history.emptyNoReports')
                        : t('history.emptyNoMatch')}
                    </li>
                  ) : (
                    visible.map((r) => (
                      <GeneratedRow
                        key={r.id}
                        report={toGenerated(r)}
                        busy={busyKey === (r.targetId ? `${r.kind}:${r.targetId}` : r.kind)}
                        onDownload={() => onRowDownload(r)}
                        onDelete={() => deleteMut.mutate(r.id)}
                      />
                    ))
                  )}
                </ul>
              )}
            </Glass>
          </motion.section>

          {/* Scheduled - deferred (Core scope) */}
          <motion.section variants={fadeUp}>
            <div className="mb-4">
              <div className="text-[hsl(var(--brand-blue))] text-[10px] font-bold uppercase tracking-[0.18em]">{t('scheduled.eyebrow')}</div>
              <div className="mt-0.5 text-base font-extrabold tracking-tight text-foreground">{t('scheduled.title')}</div>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-foreground/[0.06] bg-card px-5 py-10 text-center shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-500/[0.14] dark:text-teal-300">
                <Calendar className="h-6 w-6" />
              </span>
              <div className="text-sm font-extrabold text-foreground">{t('scheduled.comingSoonTitle')}</div>
              <div className="max-w-md text-xs leading-relaxed text-foreground/60">
                {t('scheduled.comingSoonBody')}
              </div>
            </div>
          </motion.section>
        </motion.div>
      </div>

      {picker && (
        <ReportTargetDialog
          open
          kind={picker.kind}
          templateName={picker.template.name}
          onClose={() => setPicker(null)}
          onPick={(choice) => {
            const tpl = picker.template;
            setPicker(null);
            void runGenerate(tpl, choice);
          }}
        />
      )}
    </OwnerLayout>
  );
}

function toGenerated(r: ReportRow): GeneratedReport {
  return {
    id: r.id,
    kind: r.kind,
    templateName: r.templateName,
    target: r.target ?? undefined,
    period: r.period,
    generatedAt: r.generatedAt,
    generatedBy: r.generatedBy,
    status: r.status as ReportStatus,
    pageCount: r.pageCount ?? undefined,
    sizeKb: r.sizeKb ?? undefined,
  };
}

function FilterPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/[0.16] dark:text-teal-200'
          : 'text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground/85',
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', active ? 'bg-teal-500/20 text-teal-800 dark:text-teal-200' : 'bg-foreground/[0.05] text-foreground/60')}>
        {count}
      </span>
    </button>
  );
}

interface WorkspaceSummary {
  practiceName: string;
  ownerName: string;
  initials: string;
}

function readWorkspace(): WorkspaceSummary {
  let practiceName = i18n.t('ownerReports:workspace.defaultPracticeName');
  const ownerName = i18n.t('ownerReports:workspace.defaultOwnerName');
  try {
    const raw = localStorage.getItem('sirah:workspace:draft');
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.practiceName) practiceName = d.practiceName;
    }
  } catch { /* ignore */ }

  const initials = practiceName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'SL';

  return { practiceName, ownerName, initials };
}
